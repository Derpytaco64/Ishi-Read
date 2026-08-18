"use client";

import { useEffect, useState } from "react";
import { Link } from "@readium/shared";
import {   
  Manifest, 
  Publication, 
  Fetcher, 
  HttpFetcher, 
  Layout, 
  ReadingProgression,
  Feature,
  Profile
} from "@readium/shared";
import { useAppDispatch } from "@/lib/hooks";
import {
  setRTL,
  setFXL,
  setScriptMode,
  setPositionsList,
  setHasDisplayTransformability,
  setTocTree,
} from "@/lib/publicationReducer";
import { getScriptMode } from "@readium/navigator";
import { buildTocTree } from "@/helpers/buildTocTree";
import { setReaderProfile, ReaderProfile } from "@/lib/readerReducer";
import { deserializePositions } from "@/helpers/deserializePositions";
import { ErrorHandler, ProcessedError } from "@/helpers/errorHandler";

export interface UsePublicationOptions {
  url: string;
  onError?: (error: ProcessedError) => void;
  fetcher?: Fetcher;
}

export interface UsePublicationReturn {
  // Loading states
  isLoading: boolean;
  error: ProcessedError | null;

  // Publication data
  publication: Publication | null;
  manifest: object | null;
  selfLink: string | null;
  localDataKey: string | null;

  // Profile detection
  profile: ReaderProfile | null;

  // Publication metadata
  isRTL: boolean;
  isFXL: boolean;
  hasDisplayTransformability: boolean;
}

// CLAUDE-ADDED: The bundled Go readium server's CBZ/Divina parser never emits a `toc` -- every page
// image ends up as one flat, untitled readingOrder entry, so the reader's TOC panel shows a bare list
// of however many pages the book has instead of chapters. The one place chapter structure actually
// survives is the CBZ's own folder layout (e.g. "Vol.01 Ch.0001 - The Still House.../03.png"), which
// the Go server's readingOrder hrefs already preserve faithfully -- group consecutive pages sharing a
// parent folder into one chapter entry, using the folder name as its title. A flat archive (everything
// at the zip root, one "folder") has nothing to group, so this returns empty and the pre-existing
// flat-list fallback in useTimeline/buildTocTree takes over unchanged.
function buildDivinaToc(readingOrder: unknown): { href: string; title: string }[] {
  if (!Array.isArray(readingOrder)) return [];

  const groups: { folder: string; href: string }[] = [];
  let lastFolder: string | null = null;

  for (const item of readingOrder) {
    const href = (item as { href?: unknown })?.href;
    if (typeof href !== "string") continue;

    let decoded = href;
    try {
      decoded = decodeURIComponent(href);
    } catch {
      // Malformed percent-encoding -- fall back to the raw href for grouping/titling.
    }
    const slashIndex = decoded.lastIndexOf("/");
    const folder = slashIndex >= 0 ? decoded.slice(0, slashIndex) : "";

    if (folder !== lastFolder) {
      groups.push({ folder, href });
      lastFolder = folder;
    }
  }

  if (groups.length <= 1) return [];
  return groups.map((g) => ({ href: g.href, title: g.folder || "…" }));
}

const detectProfile = (manifest: Manifest): ReaderProfile => {
  // Check conformsTo in manifest metadata to determine profile
  const metadata = manifest.metadata;
  if (!metadata) return "webPub"; // Default to webPub when no metadata
  
  const conformsTo = metadata.conformsTo;
  if (!conformsTo) return "webPub"; // Default to webPub when no conformsTo
  
  // Handle both string and array formats
  const profiles = Array.isArray(conformsTo) ? conformsTo : [conformsTo];
  
  // Check for audiobook profile first
  if (profiles.some((profile: Profile) => 
    profile === Profile.AUDIOBOOK
  )) {
    return "audio";
  }
  
  // Check for epub profile
  if (profiles.some((profile: Profile) => 
    profile === Profile.EPUB
  )) {
    return "epub";
  }
  
  // Default to webPub for any other profile or no specific profile
  return "webPub";
};

export const usePublication = ({
  url,
  onError = () => {},
  fetcher: customFetcher
}: UsePublicationOptions): UsePublicationReturn => {
  const dispatch = useAppDispatch();

  // Basic states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ProcessedError | null>(null);
  const [manifest, setManifest] = useState<object | null>(null);
  const [selfLink, setSelfLink] = useState<string | null>(null);
  const [localDataKey, setLocalDataKey] = useState<string | null>(null);

  // Publication states
  const [publication, setPublication] = useState<Publication | null>(null);
  const [profile, setProfile] = useState<ReaderProfile | null>(null);

  // Metadata states
  const [isRTL, setIsRTL] = useState(false);
  const [isFXL, setIsFXL] = useState(false);
  const [hasDisplayTransformability, setHasDisplayTransformabilityState] = useState(false);

  const handleManifestError = (error: unknown, context: string) => {
    console.error(`${ context }:`, error);
    const processedError = ErrorHandler.process(error, context);
    setError(processedError);
    setIsLoading(false);
  };

  // Basic URL validation and loading
  useEffect(() => {
    if (!url) {
      const validationError = ErrorHandler.process(new Error('Manifest URL is required'), 'Validation');
      setError(validationError);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    // Decode URL if needed
    const decodedUrl = decodeURIComponent(url);
    
    const manifestLink = new Link({ href: decodedUrl });
    const fetcher = customFetcher || new HttpFetcher(undefined);

    try {
      const fetched = fetcher.get(manifestLink);
      
      // Get self-link first
      fetched.link().then(async (link) => {
        try {
          const selfHref = link.toURL(decodedUrl);
          setSelfLink(selfHref || null);
          if (selfHref) {
            setLocalDataKey(`${ selfHref }-current-location`);
            
            // Create fetcher with selfHref for proper URL resolution
            const manifestFetcher = customFetcher || new HttpFetcher(undefined, selfHref);
            
            // Fetch manifest with proper fetcher
            const manifestFetched = manifestFetcher.get(manifestLink);
            const manifestData = await manifestFetched.readAsJSON() as {
              metadata?: { conformsTo?: string | string[]; readingProgression?: string; layout?: string };
              readingOrder?: unknown;
              toc?: unknown;
            };

            // CLAUDE-ADDED: The bundled Go readium server's CBZ/Divina parser never reads
            // ComicInfo.xml's <Manga> tag, so a manga CBZ's manifest always comes back without
            // readingProgression (defaulting to ltr). Since the browser fetches this manifest
            // directly from the Go server -- no Next.js route sits in between to patch it server-side
            // -- ask a small Next.js API route (which can read the file's ComicInfo.xml) and patch
            // the manifest here, before Manifest.deserialize/Publication ever see it. Everything
            // downstream (effectiveReadingProgression, the isRTL Redux state, arrow-button flipping)
            // already reacts to this field once it's set correctly.
            const conformsTo = manifestData.metadata?.conformsTo;
            const profiles = Array.isArray(conformsTo) ? conformsTo : conformsTo ? [conformsTo] : [];
            if (profiles.includes(Profile.DIVINA)) {
              // CLAUDE-ADDED: @readium/navigator picks its per-page frame builder off the publication's
              // *layout* (fixed vs reflowable), not directly off the Divina profile -- and the fixed
              // path is the only one that knows how to build an image frame at all (the reflowable one
              // throws "Unsupported media type for WebPub: image/png", confirmed against a live crash).
              // effectiveLayout is already supposed to default Divina to fixed on its own when this
              // field is absent (which the Go server's manifest always leaves it), so stamping it here
              // shouldn't change anything for a spec-compliant reader -- it just removes any dependence
              // on that inference running correctly before the navigator reads it.
              if (manifestData.metadata && !manifestData.metadata.layout) {
                manifestData.metadata.layout = "fixed";
              }

              try {
                const progressionRes = await fetch(
                  `/api/books/reading-progression?manifestUrl=${encodeURIComponent(decodedUrl)}`
                );
                if (progressionRes.ok) {
                  const { readingProgression } = await progressionRes.json();
                  if (readingProgression === "rtl" && manifestData.metadata) {
                    manifestData.metadata.readingProgression = "rtl";
                  }
                }
              } catch (err) {
                console.error("Could not fetch CBZ reading progression:", err);
              }

              if (!Array.isArray(manifestData.toc) || manifestData.toc.length === 0) {
                const synthesizedToc = buildDivinaToc(manifestData.readingOrder);
                if (synthesizedToc.length > 0) manifestData.toc = synthesizedToc;
              }
            }

            setManifest(manifestData as object);
            
            // Create publication
            const manifestObj = Manifest.deserialize(manifestData)!;
            manifestObj.setSelfLink(selfHref);

            // Detect profile from parsed manifest
            const detectedProfile = detectProfile(manifestObj);
            setProfile(detectedProfile);
            dispatch(setReaderProfile(detectedProfile));

            const pub = new Publication({
              manifest: manifestObj,
              fetcher: manifestFetcher
            });
            
            // CLAUDE-ADDED: Removed the blocking positionsFromManifest() call that used to run here — it forced a second sequential streamer request before the reader could mount, and duplicated the fetch already done by the metadata effect below, doubling the open-book wait.

            // For audio, build the TOC tree from the publication
            if (detectedProfile === "audio") {
              const tocLinks = manifestObj.toc?.items && manifestObj.toc.items.length > 0
                ? manifestObj.toc.items
                : manifestObj.readingOrder?.items || [];
              const publicationTitle = manifestObj.metadata.title.getTranslation("en");
              let idCounter = 0;
              const idGenerator = () => `toc-${ ++idCounter }`;
              const readingOrderHrefs = new Set(manifestObj.readingOrder?.items.map((item) => item.href) || []);
              dispatch(setTocTree(buildTocTree(tocLinks, idGenerator, undefined, publicationTitle, readingOrderHrefs)));
            }

            setPublication(pub);
            setIsLoading(false);
          }
        } catch (error: unknown) {
          handleManifestError(error, "Error loading manifest");
        }
      });
    } catch (error: unknown) {
      handleManifestError(error, "Error loading manifest");
    }
  }, [url, customFetcher, dispatch]);

  // Process publication metadata when publication is ready
  useEffect(() => {
    if (!publication) return;

    // Script mode and RTL detection
    const mode = getScriptMode(publication.metadata);
    dispatch(setScriptMode(mode));
    const rtl = publication.metadata.effectiveReadingProgression === ReadingProgression.rtl;
    setIsRTL(rtl);
    dispatch(setRTL(rtl));

    // FXL detection (only relevant for epub)
    if (profile === "epub") {
      const fxl = publication.metadata.effectiveLayout === Layout.fixed;
      setIsFXL(fxl);
      dispatch(setFXL(fxl));
    }

    // Display transformability
    const displayTransformability = publication.metadata.accessibility?.feature?.some(
      feature => feature && feature.value === Feature.DISPLAY_TRANSFORMABILITY.value
    ) || false;
    setHasDisplayTransformabilityState(displayTransformability);
    dispatch(setHasDisplayTransformability(displayTransformability));

    // Positions list (only for epub)
    if (profile === "epub" && publication) {
      const fetchPositions = async () => {
        try {
          const positionsList = await publication.positionsFromManifest();
          const deserializedPositionsList = deserializePositions(positionsList);
          dispatch(setPositionsList(deserializedPositionsList));
        } catch (error) {
          console.error("Failed to fetch positions:", error);
          dispatch(setPositionsList([]));
        }
      };

      fetchPositions();
    }
  }, [publication, profile, dispatch]);

  // Call onError callback when error changes
  useEffect(() => {
    if (error) {
      onError(error);
    }
  }, [error, onError]);

  return {
    isLoading,
    error,
    publication,
    manifest,
    selfLink,
    localDataKey,
    profile,
    isRTL,
    isFXL,
    hasDisplayTransformability
  };
};
