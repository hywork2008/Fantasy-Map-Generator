import { oceanFragmentShaderSource } from "./ocean.frag";
import { oceanVertexShaderSource } from "./ocean.vert";

export interface OceanMeshData {
  positions: Float32Array;
  layerDepths: Float32Array;
  vertexCount: number;
  mapWidth: number;
  mapHeight: number;
}

export interface OceanRendererStyle {
  baseColor: readonly [number, number, number];
  deepColor: readonly [number, number, number];
  waveColor: readonly [number, number, number];
  opacity: number;
  waveScale: number;
  waveStrength: number;
}

export interface OceanRendererOptions {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  alpha?: boolean;
  preserveDrawingBuffer?: boolean;
}

type UniformLocations = {
  projection: WebGLUniformLocation;
  view: WebGLUniformLocation;
  mapSize: WebGLUniformLocation;
  time: WebGLUniformLocation;
  opacity: WebGLUniformLocation;
  baseColor: WebGLUniformLocation;
  deepColor: WebGLUniformLocation;
  waveColor: WebGLUniformLocation;
  waveScale: WebGLUniformLocation;
  waveStrength: WebGLUniformLocation;
};

const IDENTITY_MATRIX: Float32Array<ArrayBufferLike> = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
]);

const DEFAULT_STYLE: OceanRendererStyle = {
  baseColor: [0.925, 0.949, 0.976],
  deepColor: [0.486, 0.651, 0.769],
  waveColor: [0.980, 0.996, 1.0],
  opacity: 0.75,
  waveScale: 1.0,
  waveStrength: 0.16
};

export class OceanRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext | null;
  private isAvailable: boolean;
  private readonly style: OceanRendererStyle;

  private program: WebGLProgram | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private layerDepthBuffer: WebGLBuffer | null = null;

  private positionLocation = -1;
  private layerDepthLocation = -1;
  private uniforms: UniformLocations | null = null;

  private projectionMatrix: Float32Array<ArrayBufferLike> = IDENTITY_MATRIX;
  private viewMatrix: Float32Array<ArrayBufferLike> = IDENTITY_MATRIX;

  private vertexCount = 0;
  private mapWidth = 1;
  private mapHeight = 1;

  constructor(options: OceanRendererOptions) {
    this.canvas = options.canvas;
    this.style = {...DEFAULT_STYLE};

    const gl = this.canvas.getContext("webgl", {
      antialias: options.antialias ?? true,
      alpha: options.alpha ?? true,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false
    });

    this.gl = gl;
    this.isAvailable = !!gl;

    if (!this.isAvailable) return;

    const program = this.createProgram(oceanVertexShaderSource, oceanFragmentShaderSource);
    if (!program) {
      this.isAvailable = false;
      return;
    }

    this.program = program;
    this.positionBuffer = gl.createBuffer();
    this.layerDepthBuffer = gl.createBuffer();

    if (!this.positionBuffer || !this.layerDepthBuffer) {
      this.isAvailable = false;
      return;
    }

    this.positionLocation = gl.getAttribLocation(program, "a_position");
    this.layerDepthLocation = gl.getAttribLocation(program, "a_layerDepth");

    this.uniforms = this.getUniformLocations(program);
    if (!this.uniforms || this.positionLocation < 0 || this.layerDepthLocation < 0) {
      this.isAvailable = false;
      return;
    }

    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  get supported(): boolean {
    return this.isAvailable;
  }

  setProjectionViewMatrices(
    projectionMatrix: Float32Array<ArrayBufferLike>,
    viewMatrix: Float32Array<ArrayBufferLike> = IDENTITY_MATRIX
  ): void {
    this.projectionMatrix = projectionMatrix;
    this.viewMatrix = viewMatrix;
  }

  setMapSize(mapWidth: number, mapHeight: number): void {
    this.mapWidth = Math.max(1, mapWidth);
    this.mapHeight = Math.max(1, mapHeight);
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;

    if (!this.gl) return;
    this.gl.viewport(0, 0, w, h);
  }

  setStyle(style: Partial<OceanRendererStyle>): void {
    Object.assign(this.style, style);
  }

  setMeshData(data: OceanMeshData): void {
    if (!this.gl || !this.program || !this.positionBuffer || !this.layerDepthBuffer || !this.uniforms) return;

    this.vertexCount = data.vertexCount;
    this.mapWidth = Math.max(1, data.mapWidth);
    this.mapHeight = Math.max(1, data.mapHeight);

    const gl = this.gl;

    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.layerDepthBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.layerDepths, gl.STATIC_DRAW);
  }

  clear(): void {
    if (!this.gl) return;
    this.vertexCount = 0;
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  render(timeSeconds = 0): void {
    if (!this.gl || !this.program || !this.uniforms || this.vertexCount === 0) return;

    const gl = this.gl;

    gl.useProgram(this.program);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.uniformMatrix4fv(this.uniforms.projection, false, this.projectionMatrix);
    gl.uniformMatrix4fv(this.uniforms.view, false, this.viewMatrix);
    gl.uniform2f(this.uniforms.mapSize, this.mapWidth, this.mapHeight);
    gl.uniform1f(this.uniforms.time, timeSeconds);
    gl.uniform1f(this.uniforms.opacity, this.style.opacity);
    gl.uniform3f(this.uniforms.baseColor, this.style.baseColor[0], this.style.baseColor[1], this.style.baseColor[2]);
    gl.uniform3f(this.uniforms.deepColor, this.style.deepColor[0], this.style.deepColor[1], this.style.deepColor[2]);
    gl.uniform3f(this.uniforms.waveColor, this.style.waveColor[0], this.style.waveColor[1], this.style.waveColor[2]);
    gl.uniform1f(this.uniforms.waveScale, this.style.waveScale);
    gl.uniform1f(this.uniforms.waveStrength, this.style.waveStrength);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.layerDepthBuffer);
    gl.enableVertexAttribArray(this.layerDepthLocation);
    gl.vertexAttribPointer(this.layerDepthLocation, 1, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
  }

  dispose(): void {
    if (!this.gl) return;
    const gl = this.gl;

    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.layerDepthBuffer) gl.deleteBuffer(this.layerDepthBuffer);
    if (this.program) gl.deleteProgram(this.program);

    this.positionBuffer = null;
    this.layerDepthBuffer = null;
    this.program = null;
    this.uniforms = null;
    this.vertexCount = 0;
  }

  static createOrthographicProjection(width: number, height: number): Float32Array<ArrayBufferLike> {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);

    return new Float32Array([
      2 / safeWidth, 0, 0, 0,
      0, -2 / safeHeight, 0, 0,
      0, 0, 1, 0,
      -1, 1, 0, 1
    ]);
  }

  private getUniformLocations(program: WebGLProgram): UniformLocations | null {
    if (!this.gl) return null;
    const gl = this.gl;

    const projection = gl.getUniformLocation(program, "u_projection");
    const view = gl.getUniformLocation(program, "u_view");
    const mapSize = gl.getUniformLocation(program, "u_mapSize");
    const time = gl.getUniformLocation(program, "u_time");
    const opacity = gl.getUniformLocation(program, "u_opacity");
    const baseColor = gl.getUniformLocation(program, "u_baseColor");
    const deepColor = gl.getUniformLocation(program, "u_deepColor");
    const waveColor = gl.getUniformLocation(program, "u_waveColor");
    const waveScale = gl.getUniformLocation(program, "u_waveScale");
    const waveStrength = gl.getUniformLocation(program, "u_waveStrength");

    if (!projection || !view || !mapSize || !time || !opacity || !baseColor || !deepColor || !waveColor || !waveScale || !waveStrength) {
      return null;
    }

    return {projection, view, mapSize, time, opacity, baseColor, deepColor, waveColor, waveScale, waveStrength};
  }

  private createProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
    if (!this.gl) return null;

    const gl = this.gl;
    const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);

    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!linked) {
      console.error("Failed to link ocean WebGL program", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  private compileShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;
    const gl = this.gl;

    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!compiled) {
      console.error("Failed to compile ocean WebGL shader", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }
}
