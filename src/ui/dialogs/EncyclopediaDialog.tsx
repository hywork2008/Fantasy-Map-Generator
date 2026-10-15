import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  EncyclopediaBlock,
  EncyclopediaEntryStub,
  EncyclopediaLanguage
} from "../../encyclopedia/encyclopediaTypes";
import { resolveText, toEncyclopediaLanguage } from "../../encyclopedia/localizedText";
import { parseMarkdown } from "../../encyclopedia/markdown";
import {
  ENCYCLOPEDIA_NAMESPACE_ORDER,
  getBacklinks,
  getEncyclopediaEntry,
  getOutgoingLinks,
  listEncyclopediaEntries
} from "../../encyclopedia/registry";
import { buildSearchIndex, searchEncyclopedia } from "../../encyclopedia/search";
import { useDialogState } from "../../store/dialogState";
import { useEncyclopediaState } from "../../store/encyclopediaState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";
import { type EncyclopediaLinkContext, EncyclopediaMarkdown } from "./EncyclopediaMarkdown";
import "./encyclopediaDialog.css";

const BlockView: React.FC<{
  block: EncyclopediaBlock;
  language: EncyclopediaLanguage;
  ctx: EncyclopediaLinkContext;
}> = ({ block, language, ctx }) => {
  if (block.kind === "list") {
    return (
      <ul>
        {block.items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static content
          <li key={index}>{resolveText(item, language)}</li>
        ))}
      </ul>
    );
  }
  return <EncyclopediaMarkdown blocks={parseMarkdown(resolveText(block.text, language), block.linkMap)} ctx={ctx} />;
};

export const EncyclopediaDialog: React.FC = () => {
  const { t, i18n } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("encyclopedia"));
  const selectedId = useEncyclopediaState(state => state.selectedId);
  const canGoBack = useEncyclopediaState(state => state.history.length > 0);
  const query = useEncyclopediaState(state => state.query);
  const select = useEncyclopediaState(state => state.select);
  const back = useEncyclopediaState(state => state.back);
  const setQuery = useEncyclopediaState(state => state.setQuery);
  const language = toEncyclopediaLanguage(i18n.language);

  const stubs = useMemo(() => (isOpen ? listEncyclopediaEntries() : []), [isOpen]);
  const index = useMemo(() => buildSearchIndex(stubs), [stubs]);
  const results = useMemo(() => searchEncyclopedia(index, query), [index, query]);

  // Group by namespace only when browsing; search results stay in relevance order.
  const groups = useMemo(() => {
    if (query.trim()) return [{ namespace: null, entries: results }];
    return ENCYCLOPEDIA_NAMESPACE_ORDER.map(namespace => ({
      namespace,
      entries: results.filter(stub => stub.namespace === namespace)
    })).filter(group => group.entries.length > 0);
  }, [query, results]);

  const entry = isOpen ? getEncyclopediaEntry(selectedId) : null;
  const ctx: EncyclopediaLinkContext = useMemo(
    () => ({
      titleOf: id => {
        const target = getEncyclopediaEntry(id);
        return target ? resolveText(target.title, language) : null;
      },
      onOpenEntry: select
    }),
    [language, select]
  );
  const outgoing = useMemo(() => (entry ? getOutgoingLinks(entry) : []), [entry]);
  const backlinks = useMemo(() => (entry ? getBacklinks(entry.id) : []), [entry]);

  const renderLinkList = (ids: readonly string[]) => (
    <ul className="encyclopedia__related">
      {ids.map(id => {
        const title = ctx.titleOf(id);
        return (
          <li key={id}>
            {title === null ? (
              <span className="encyclopedia__missing-link">{id}</span>
            ) : (
              <button type="button" className="encyclopedia__entry-link" onClick={() => select(id)}>
                {title}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );

  const renderStub = (stub: EncyclopediaEntryStub) => (
    <li key={stub.id}>
      <button
        type="button"
        className={`encyclopedia__nav-item${stub.id === selectedId ? " encyclopedia__nav-item--selected" : ""}`}
        onClick={() => select(stub.id)}
        data-tip={stub.summary ? resolveText(stub.summary, language) : undefined}
      >
        {resolveText(stub.title, language)}
      </button>
    </li>
  );

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.encyclopedia")}
      onClose={() => closeDialog("encyclopedia")}
      className="fmg-dialog--encyclopedia"
    >
      <div className="encyclopedia">
        <nav className="encyclopedia__sidebar">
          <input
            type="search"
            className="encyclopedia__search"
            value={query}
            placeholder={t("encyclopedia.searchPlaceholder")}
            aria-label={t("encyclopedia.searchPlaceholder")}
            onChange={event => setQuery(event.target.value)}
          />
          {groups.length === 0 && <p className="encyclopedia__empty">{t("encyclopedia.noResults")}</p>}
          {groups.map(group => (
            <section key={group.namespace ?? "results"}>
              {group.namespace && (
                <h4 className="encyclopedia__group">{t(`encyclopedia.namespaces.${group.namespace}`)}</h4>
              )}
              <ul className="encyclopedia__nav">{group.entries.map(renderStub)}</ul>
            </section>
          ))}
        </nav>
        <article key={selectedId} className="encyclopedia__article">
          <div className="encyclopedia__toolbar">
            <button type="button" onClick={back} disabled={!canGoBack}>
              {t("encyclopedia.back")}
            </button>
          </div>
          {entry ? (
            <>
              <p className="encyclopedia__namespace">{t(`encyclopedia.namespaces.${entry.namespace}`)}</p>
              <h2 className="encyclopedia__title">{resolveText(entry.title, language)}</h2>
              {entry.body.map((block, blockIndex) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static content
                <BlockView key={blockIndex} block={block} language={language} ctx={ctx} />
              ))}
              {entry.sources && entry.sources.length > 0 && (
                <>
                  <h3>{t("encyclopedia.sources")}</h3>
                  <ul>
                    {entry.sources.map(source => (
                      <li key={source.url}>
                        <a href={source.url} target="_blank" rel="noopener noreferrer">
                          {source.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {outgoing.length > 0 && (
                <>
                  <h3>{t("encyclopedia.seeAlso")}</h3>
                  {renderLinkList(outgoing)}
                </>
              )}
              {backlinks.length > 0 && (
                <>
                  <h3>{t("encyclopedia.referencedBy")}</h3>
                  {renderLinkList(backlinks.map(stub => stub.id))}
                </>
              )}
            </>
          ) : (
            <p className="encyclopedia__empty">{t("encyclopedia.entryNotFound", { id: selectedId })}</p>
          )}
        </article>
      </div>
    </Dialog>
  );
};
