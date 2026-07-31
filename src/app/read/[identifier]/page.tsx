"use client";

import { use, useEffect, useState } from "react";
import { ErrorDisplay, StatefulLoader } from "@/components/Misc";
import { ThI18nProvider } from "@/i18n/ThI18nProvider";
import { PUBLICATION_MANIFESTS } from "@/config/publications";
import { usePublication } from "@/hooks/usePublication";
import { useServerPosition } from "@/hooks/useServerPosition";
import { useAppSelector, useAppDispatch } from "@/lib/hooks";
import { loadAnnotations } from "@/lib/annotationsReducer";
import { loadReadingTime } from "@/lib/readingTimeReducer";
import { loadListeningTime } from "@/lib/listeningTimeReducer";
import { verifyManifestUrl } from "@/app/api/verify-manifest/verifyDomain";
import { StatefulReaderWrapper } from "@/components/Reader/StatefulReaderWrapper";
import { ErrorHandler, ProcessedError } from "@/helpers/errorHandler";

type Params = { identifier: string };

type Props = {
  params: Promise<Params>;
};

export default function BookPage({ params }: Props) {
  const [domainError, setDomainError] = useState<ProcessedError | null>(null);
  const identifier = use(params).identifier;
  const isLoading = useAppSelector(state => state.reader.isLoading);
  const dispatch = useAppDispatch();
  
  // Check predefined publications, fallback to direct URL
  const manifestUrl = identifier 
    ? PUBLICATION_MANIFESTS[identifier as keyof typeof PUBLICATION_MANIFESTS] || 
      identifier
    : "";

  useEffect(() => {
    if (manifestUrl) {
      verifyManifestUrl(manifestUrl).then(allowed => {
        if (!allowed) {
          const processedDomainError = ErrorHandler.process(
            new Error("Domain not allowed"), 
            "Domain Validation"
          );
          setDomainError(processedDomainError);
        }
      });
    }
  }, [manifestUrl]);

  const {
    isLoading: publicationLoading,
    error,
    publication,
    profile,
    localDataKey
  } = usePublication({
    url: manifestUrl,
    onError: (error) => {
      console.error("Publication loading error:", error);
    }
  });

  // CLAUDE-ADDED: Runs in parallel with the manifest fetch above rather than after it -- resolves
  // to the server-saved reading position (KOSync-hash-identified, survives the underlying file being
  // renamed) instead of the browser's localStorage.
  const { isLoading: positionLoading, positionStorage } = useServerPosition(manifestUrl || null);

  // CLAUDE-ADDED: Loads highlights/bookmarks/notes into Redux (annotationsReducer) -- unlike position,
  // not gated on for mounting since a highlight/note popping in slightly after first paint is fine.
  useEffect(() => {
    if (manifestUrl) {
      dispatch(loadAnnotations(manifestUrl));
    }
  }, [manifestUrl, dispatch]);

  // CLAUDE-ADDED: Loads the book's accumulated reading time (readingTimeReducer) the same non-blocking
  // way as annotations -- useReadingTimer waits on isLoaded before it starts ticking, so this must
  // resolve before any local increments happen, but the page itself doesn't need to wait on it.
  useEffect(() => {
    if (manifestUrl) {
      dispatch(loadReadingTime(manifestUrl));
    }
  }, [manifestUrl, dispatch]);

  // CLAUDE-ADDED: Audiobook counterpart to loadReadingTime above, dispatched the same
  // format-agnostic way -- only StatefulPlayer ever acts on this data (see listeningTimeReducer.ts).
  useEffect(() => {
    if (manifestUrl) {
      dispatch(loadListeningTime(manifestUrl));
    }
  }, [manifestUrl, dispatch]);

  if (domainError) {
    // CLAUDE-ADDED: See read/manifest/[manifest]/page.tsx's identical comment -- ThI18nProvider
    // otherwise only mounts inside StatefulReaderWrapper, which never renders on an error path.
    return (
      <ThI18nProvider>
        <ErrorDisplay error={ domainError } />
      </ThI18nProvider>
    );
  }

  return (
    <>
      { error ? (
        <ThI18nProvider>
          <ErrorDisplay error={ error } />
        </ThI18nProvider>
      ) : publication && !positionLoading ? (
        // CLAUDE-ADDED: positionLoading gates the mount itself, not just the isLoading prop below --
        // StatefulReaderWrapper's internal StatefulLoader always renders its children underneath the
        // spinner overlay, so the inner reader (and its one-time-synchronous PositionStorage.get()
        // read) would otherwise mount before the fetched position is available and lock in the wrong
        // starting page.
        <StatefulReaderWrapper
          profile={ profile }
          publication={ publication }
          localDataKey={ localDataKey }
          positionStorage={ positionStorage }
          isLoading={ isLoading || publicationLoading }
        />
      ) : (
        // CLAUDE-ADDED: Show the loader instead of rendering nothing so the wait for the manifest doesn't look like a frozen blank page.
        <StatefulLoader isLoading={ true }>
          <></>
        </StatefulLoader>
      ) }
    </>
  );
}
