import { expect, it } from "vitest";
import { worldTreeAltitude } from "./worldTreeGrounding";

it("keeps the root feet below both high peaks and low valleys at minimum and maximum wallpaper heights", () => {
  const image = { width: 8, height: 101, data: new Uint8Array(8 * 101 * 4) };
  for (let x = 0; x < image.width; x++)
    for (let y = 0; y <= (x === 3 || x === 4 ? 55 : 80); y++) image.data[(y * image.width + x) * 4 + 3] = 255;
  const contacts = [
    [0.5, 0.02],
    [0.75, 0.06]
  ];
  const treeHeight = 2400 / 0.9;
  for (const sceneryHeight of [60, 240, 480]) {
    const altitude = worldTreeAltitude(image, sceneryHeight, treeHeight, Math.PI, contacts);
    const highRidge = 12 + ((0.8 - 0.48) / 0.52) * (sceneryHeight - 12);
    const valleyRidge = 12 + ((0.55 - 0.48) / 0.52) * (sceneryHeight - 12);
    expect(altitude + contacts[0][1] * treeHeight).toBeLessThan(highRidge);
    expect(altitude + contacts[1][1] * treeHeight).toBeLessThan(valleyRidge);
  }
});
