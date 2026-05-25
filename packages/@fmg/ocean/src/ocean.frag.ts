export const oceanFragmentShaderSource = `
precision mediump float;

uniform float u_time;
uniform float u_opacity;
uniform vec3 u_baseColor;
uniform vec3 u_deepColor;
uniform vec3 u_waveColor;
uniform float u_waveScale;
uniform float u_waveStrength;

varying vec2 v_uv;
varying float v_layerDepth;

void main() {
  float depthMix = clamp((-v_layerDepth) / 10.0, 0.0, 1.0);
  vec3 gradientColor = mix(u_baseColor, u_deepColor, depthMix);

  float waveA = sin((v_uv.x * 9.0 + v_uv.y * 5.0) * u_waveScale + u_time * 1.25);
  float waveB = sin((v_uv.x * 4.0 - v_uv.y * 11.0) * (u_waveScale * 0.67) - u_time * 0.9);
  float wave = waveA * 0.6 + waveB * 0.4;

  float crest = smoothstep(0.5, 1.0, wave);
  float foam = crest * u_waveStrength * (1.0 - depthMix);
  vec3 finalColor = gradientColor + u_waveColor * foam;

  gl_FragColor = vec4(finalColor, u_opacity);
}
`;
