import type React from "react";
import { Fragment } from "react";
import type { MarkdownBlock, MarkdownInline } from "../../encyclopedia/markdown";

export interface EncyclopediaLinkContext {
  /** Title of an existing entry in the current language, or null if no such entry exists. */
  titleOf: (id: string) => string | null;
  onOpenEntry: (id: string) => void;
}

const Inline: React.FC<{ nodes: readonly MarkdownInline[]; ctx: EncyclopediaLinkContext }> = ({ nodes, ctx }) => (
  <>
    {nodes.map((node, index) => {
      const key = index;
      switch (node.kind) {
        case "text":
          return <Fragment key={key}>{node.text}</Fragment>;
        case "lineBreak":
          return <br key={key} />;
        case "code":
          return <code key={key}>{node.text}</code>;
        case "strong":
          return (
            <strong key={key}>
              <Inline nodes={node.children} ctx={ctx} />
            </strong>
          );
        case "em":
          return (
            <em key={key}>
              <Inline nodes={node.children} ctx={ctx} />
            </em>
          );
        case "externalLink":
          return (
            <a key={key} href={node.href} target="_blank" rel="noopener noreferrer">
              <Inline nodes={node.children} ctx={ctx} />
            </a>
          );
        case "entryLink": {
          const title = ctx.titleOf(node.entryId);
          // `[[id]]` without a label shows the target's title rather than the raw id.
          const isBareId =
            node.children.length === 1 && node.children[0].kind === "text" && node.children[0].text === node.entryId;
          const label = isBareId ? (title ?? node.entryId) : <Inline nodes={node.children} ctx={ctx} />;
          // Links to entries that do not exist (yet) render as plain text instead of dead links.
          if (title === null) {
            return (
              <span key={key} className="encyclopedia__missing-link">
                {label}
              </span>
            );
          }
          return (
            <button
              key={key}
              type="button"
              className="encyclopedia__entry-link"
              onClick={() => ctx.onOpenEntry(node.entryId)}
            >
              {label}
            </button>
          );
        }
        default:
          return null;
      }
    })}
  </>
);

export const EncyclopediaMarkdown: React.FC<{ blocks: readonly MarkdownBlock[]; ctx: EncyclopediaLinkContext }> = ({
  blocks,
  ctx
}) => (
  <>
    {blocks.map((block, index) => {
      const key = index;
      switch (block.kind) {
        case "heading": {
          // The article title is the dialog's h2, so Markdown headings start one level below it.
          const Tag = `h${Math.min(6, block.level + 2)}` as "h3";
          return (
            <Tag key={key}>
              <Inline nodes={block.children} ctx={ctx} />
            </Tag>
          );
        }
        case "paragraph":
          return (
            <p key={key}>
              <Inline nodes={block.children} ctx={ctx} />
            </p>
          );
        case "rule":
          return <hr key={key} />;
        case "list": {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag key={key}>
              {block.items.map((item, itemIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static parsed content
                <li key={itemIndex}>
                  <Inline nodes={item} ctx={ctx} />
                </li>
              ))}
            </ListTag>
          );
        }
        case "table":
          return (
            <table key={key} className="encyclopedia__table">
              <thead>
                <tr>
                  {block.header.map((cell, cellIndex) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static parsed content
                    <th key={cellIndex}>
                      <Inline nodes={cell} ctx={ctx} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static parsed content
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: static parsed content
                      <td key={cellIndex}>
                        <Inline nodes={cell} ctx={ctx} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        default:
          return null;
      }
    })}
  </>
);
