import {
  EventType,
  StrokeModeler,
  defaultStrokeModelParams,
  type Result,
} from 'ink-stroke-modeler-ts';

export interface ModeledPoint {
  x: number;
  y: number;
  pressure: number;
}

/**
 * Thin adapter over Google's Ink Stroke Modeler (TypeScript port).
 * It smooths noisy pointer input and optionally predicts the stroke ahead,
 * while leaving rendering entirely to perfect-freehand.
 */
export class InkModeler {
  private readonly modeler = new StrokeModeler();
  private readonly results: Result[] = [];
  private readonly predictions: Result[] = [];

  reset(): boolean {
    return this.modeler.reset(defaultStrokeModelParams()).ok;
  }

  update(type: EventType, x: number, y: number, time: number, pressure: number): ModeledPoint[] {
    this.results.length = 0;
    const status = this.modeler.update({
      eventType: type,
      position: { x, y },
      time,
      pressure: Math.max(0, Math.min(1, pressure)),
    }, this.results);
    if (!status.ok) return [];
    return this.results.map((result) => ({
      x: result.position.x,
      y: result.position.y,
      pressure: result.pressure >= 0 ? result.pressure : pressure,
    }));
  }

  predict(): ModeledPoint[] {
    this.predictions.length = 0;
    const status = this.modeler.predict(this.predictions);
    if (!status.ok) return [];
    return this.predictions.map((result) => ({
      x: result.position.x,
      y: result.position.y,
      pressure: result.pressure >= 0 ? result.pressure : 0.5,
    }));
  }
}

export { EventType };
