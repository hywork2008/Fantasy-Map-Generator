import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { handleMapContextMenu, setDistanceFromHere, setDistanceToHere } from "../../controllers/mapContextMenu";
import { closeMapContextMenu, useMapContextMenuState } from "../../store/mapContextMenuState";
import "./mapContextMenu.css";

const MENU_MARGIN = 8;
const MENU_OFFSET = 2;

export function MapContextMenu() {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const { isOpen, clientX, clientY, mapX, mapY, distanceFrom, targetBurgName } = useMapContextMenuState();

  useEffect(() => {
    const map = document.getElementById("map");
    if (!map) return;
    map.addEventListener("contextmenu", handleMapContextMenu);
    return () => map.removeEventListener("contextmenu", handleMapContextMenu);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMapContextMenu();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node | null)) return;
      closeMapContextMenu();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("fmg:zoom-level-changed", closeMapContextMenu);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("fmg:zoom-level-changed", closeMapContextMenu);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!isOpen || !menu) return;
    menu.style.left = "0px";
    menu.style.top = "0px";
    const rect = menu.getBoundingClientRect();
    const left = Math.min(Math.max(clientX + MENU_OFFSET, MENU_MARGIN), window.innerWidth - rect.width - MENU_MARGIN);
    const top = Math.min(Math.max(clientY + MENU_OFFSET, MENU_MARGIN), window.innerHeight - rect.height - MENU_MARGIN);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }, [isOpen, clientX, clientY]);

  const onFromHere = useCallback(() => {
    setDistanceFromHere(mapX, mapY);
  }, [mapX, mapY]);

  const onToHere = useCallback(() => {
    setDistanceToHere(mapX, mapY);
  }, [mapX, mapY]);

  if (!isOpen) return null;

  const fromLabel = targetBurgName
    ? t("mapContextMenu.distanceFromBurg", { name: targetBurgName })
    : t("mapContextMenu.distanceFromHere");
  const toLabel = targetBurgName
    ? t("mapContextMenu.distanceToBurg", { name: targetBurgName })
    : t("mapContextMenu.distanceToHere");

  return (
    <div
      ref={menuRef}
      id="mapContextMenu"
      className="map-context-menu"
      role="menu"
      aria-label={t("mapContextMenu.label")}
      onContextMenu={event => event.preventDefault()}
    >
      <button type="button" role="menuitem" className="map-context-menu__item" onClick={onFromHere}>
        {fromLabel}
      </button>
      <button
        type="button"
        role="menuitem"
        className="map-context-menu__item"
        onClick={onToHere}
        disabled={!distanceFrom}
        title={!distanceFrom ? t("mapContextMenu.distanceToHereDisabled") : undefined}
      >
        {toLabel}
      </button>
    </div>
  );
}
