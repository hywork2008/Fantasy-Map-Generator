export type MapEventHandler = (event: MouseEvent) => void;

class MapInteractionManager {
  private activeClickHandler: MapEventHandler | null = null;
  private activeMouseMoveHandler: MapEventHandler | null = null;
  private defaultClickHandler: MapEventHandler | null = null;
  private defaultMouseMoveHandler: MapEventHandler | null = null;
  private currentElement: Element | null = null;

  constructor() {
    this.handleViewboxClick = this.handleViewboxClick.bind(this);
    this.handleViewboxMouseMove = this.handleViewboxMouseMove.bind(this);
  }

  public init(viewboxElement: Element, defaultClick: MapEventHandler, defaultMouseMove: MapEventHandler): void {
    this.defaultClickHandler = defaultClick;
    this.defaultMouseMoveHandler = defaultMouseMove;

    if (this.currentElement === viewboxElement) return;

    // Remove listeners from the previous element (e.g. after map reload replaces SVG)
    if (this.currentElement) {
      this.currentElement.removeEventListener("click", this.handleViewboxClick as EventListener);
      this.currentElement.removeEventListener("mousemove", this.handleViewboxMouseMove as EventListener);
      this.currentElement.removeEventListener("touchmove", this.handleViewboxMouseMove as EventListener);
    }

    viewboxElement.addEventListener("click", this.handleViewboxClick as EventListener);
    viewboxElement.addEventListener("mousemove", this.handleViewboxMouseMove as EventListener);
    viewboxElement.addEventListener("touchmove", this.handleViewboxMouseMove as EventListener);
    this.currentElement = viewboxElement;
  }

  public setClickHandler(handler: MapEventHandler | null): void {
    this.activeClickHandler = handler;
  }

  public setMouseMoveHandler(handler: MapEventHandler | null): void {
    this.activeMouseMoveHandler = handler;
  }

  public resetClickHandler(): void {
    this.activeClickHandler = null;
  }

  public resetMouseMoveHandler(): void {
    this.activeMouseMoveHandler = null;
  }

  private handleViewboxClick(event: MouseEvent): void {
    const context = this.currentElement || this;
    if (this.activeClickHandler) {
      this.activeClickHandler.call(context, event);
    } else if (this.defaultClickHandler) {
      this.defaultClickHandler.call(context, event);
    }
  }

  private handleViewboxMouseMove(event: MouseEvent): void {
    const context = this.currentElement || this;
    if (this.activeMouseMoveHandler) {
      this.activeMouseMoveHandler.call(context, event);
    } else if (this.defaultMouseMoveHandler) {
      this.defaultMouseMoveHandler.call(context, event);
    }
  }
}

export const interactionManager = new MapInteractionManager();
