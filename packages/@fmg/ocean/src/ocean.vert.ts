export const oceanVertexShaderSource = `
attribute vec2 a_position;
attribute float a_layerDepth;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform vec2 u_mapSize;

varying vec2 v_uv;
varying float v_layerDepth;

void main() {
  vec4 worldPos = vec4(a_position.xy, 0.0, 1.0);
  gl_Position = u_projection * u_view * worldPos;

  v_uv = a_position / max(u_mapSize, vec2(1.0));
  v_layerDepth = a_layerDepth;
}
`;
