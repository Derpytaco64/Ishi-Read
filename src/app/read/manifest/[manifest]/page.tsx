"use client";

import { use, useEffect, useState } from "react";
import { ErrorDisplay, StatefulLoader } from "@/components/Misc";
import { usePublication } from "@/hooks/usePublication";
import { useServerPosition } from "@/hooks/useServerPosition";
import { useAppSelector, useAppDispatch } from "@/lib/hooks";
import { loadAnnotations } from "@/lib/annotationsReducer";
import { loadReadingTime } from "@/lib/readingTimeReducer";
import { verifyManifestUrl } from "@/app/api/verify-manifest/verifyDomain";
import { StatefulReaderWrapper } from "@/components/Reader/StatefulReaderWrapper";
import { ErrorHandler, ProcessedError } from "@/helpers/errorHandler";

type Params = { manifest: string };

type Props = {
  params: Promise<Params>;
};

export default function ManifestPage({ params }: Props) {
  const [domainError, setDomainError] = useState<ProcessedError | null>(null);
  const isLoading = useAppSelector(state => state.reader.isLoading);
  const dispatch = useAppDispatch();
  const manifestUrl = use(params).manifest;

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
      console.error("Manifest loading error:", error);
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

  // CLAUDE-ADDED: Loads the book's accumulated reading time -- see read/[identifier]/page.tsx for why
  // this is non-blocking.
  useEffect(() => {
    if (manifestUrl) {
      dispatch(loadReadingTime(manifestUrl));
    }
  }, [manifestUrl, dispatch]);

  if (domainError) {
    return (
      <ErrorDisplay
        error={ domainError }
      />
    );
  }

  return (
    <>
      { error ? (
        <ErrorDisplay error={ error } />
      ) : publication && !positionLoading ? (
        // CLAUDE-ADDED: positionLoading gates the mount itself -- see read/[identifier]/page.tsx for why.
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
