export type MapEventHandler = (event: MouseEvent) => void;

class MapInteractionManager {
  private activeClickHandler: MapEventHandler | null = null;
  private activeMouseMoveHandler: MapEventHandler | null = null;
  private defaultClickHandler: MapEventHandler | null = null;
  private defaultMouseMoveHandler: MapEventHandler | null = null;
  private isInitialized = false;

  constructor() {
    this.handleViewboxClick = this.handleViewboxClick.bind(this);
    this.handleViewboxMouseMove = this.handleViewboxMouseMove.bind(this);
  }

  public init(viewboxElement: Element, defaultClick: MapEventHandler, defaultMouseMove: MapEventHandler): void {
    if (this.isInitialized) return;
    this.defaultClickHandler = defaultClick;
    this.defaultMouseMoveHandler = defaultMouseMove;

    // Use native event listeners for delegation
    viewboxElement.addEventListener("click", this.handleViewboxClick as EventListener);
    viewboxElement.addEventListener("mousemove", this.handleViewboxMouseMove as EventListener);
    viewboxElement.addEventListener("touchmove", this.handleViewboxMouseMove as EventListener);
    this.isInitialized = true;
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
    if (this.activeClickHandler) {
      this.activeClickHandler(event);
    } else if (this.defaultClickHandler) {
      this.defaultClickHandler(event);
    }
  }

  private handleViewboxMouseMove(event: MouseEvent): void {
    if (this.activeMouseMoveHandler) {
      this.activeMouseMoveHandler(event);
    } else if (this.defaultMouseMoveHandler) {
      this.defaultMouseMoveHandler(event);
    }
  }
}

export const interactionManager = new MapInteractionManager();
