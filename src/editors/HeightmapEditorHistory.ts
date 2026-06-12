import type { TypedArray } from "../types/PackedGraph";
import { UndoStack } from "../utils/UndoStack";

/**
 * Manages undo/redo history for heightmap editing.
 * Each push() copies the caller-supplied TypedArray so the caller
 * does not need to call .slice() manually.
 */
class HeightmapEditorHistoryClass {
  private readonly stack = new UndoStack<TypedArray>();

  push(h: TypedArray): void {
    this.stack.push(h.slice() as TypedArray);
  }

  undo(): TypedArray | undefined {
    return this.stack.undo();
  }

  redo(): TypedArray | undefined {
    return this.stack.redo();
  }

  reset(): void {
    this.stack.reset();
  }

  get current(): TypedArray | undefined {
    return this.stack.current;
  }

  get canUndo(): boolean {
    return this.stack.canUndo;
  }

  get canRedo(): boolean {
    return this.stack.canRedo;
  }
}

declare global {
  var HeightmapEditorHistory: typeof HeightmapEditorHistoryClass;
  // heightmapHistory is a temp global created while the heightmap editor is open
  var heightmapHistory: HeightmapEditorHistoryClass | undefined;
}

window.HeightmapEditorHistory = HeightmapEditorHistoryClass;
