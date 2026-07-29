"use client";

import type { ReactNode } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// CLAUDE-ADDED: Shared by every clamped/excerpt note preview (AnnotationsContent's list row,
// StatefulBookSheet's annotations tab) -- unlike NoteOverlay.tsx's full read view, these previews
// sit inside a `-webkit-line-clamp` box, where block-level markdown output (p/ul/li/h1-6/
// blockquote/pre) breaks the clamp and reads oddly squeezed into 2-3 lines anyway. Collapsing
// every block element to inline text (with a trailing space so words don't run together) keeps
// inline formatting -- **bold**, *italic*, `code`, links -- visible in the preview while the whole
// note still flows as one clamped block, same as the plain-text preview it replaces.
const spacedInline = ({ children }: { children?: ReactNode }) => <>{ children } </>;

const inlineComponents: Components = {
  p: spacedInline,
  ul: spacedInline,
  ol: spacedInline,
  li: spacedInline,
  h1: spacedInline,
  h2: spacedInline,
  h3: spacedInline,
  h4: spacedInline,
  h5: spacedInline,
  h6: spacedInline,
  blockquote: spacedInline,
  pre: spacedInline
};

export const NoteMarkdownExcerpt = ({ text }: { text: string }) => (
  <ReactMarkdown remarkPlugins={ [remarkGfm] } components={ inlineComponents }>{ text }</ReactMarkdown>
);
