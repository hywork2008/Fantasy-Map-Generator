# World tree with visible branches

- Asset: `world-tree-branches-v1.png` (1024 × 1536 RGBA)
- Generation: built-in `image_gen.imagegen`, transparent background enabled.
- Reference role: shape reference, not an edit target.
- Reference: https://img.magnific.com/premium-photo/yggdrasil-from-norse-mythology-known-for-being-the-tree-of-life_742252-1911.jpg
- Rendering: preserve the original alpha and aspect ratio; crop the summit in UV space and apply atmospheric opacity in `skyBackdrop.ts`.

## Generation prompt

Use case: stylized-concept. Asset type: production game texture, isolated Yggdrasil world tree cutout on genuinely transparent background, portrait 2:3 image (1024x1536 preferred). The attached image is a SHAPE REFERENCE only: use the main tree at the left, its ancient, muscular, twisting intertwined trunk and mighty organic spreading branches. Create a new single world tree with MUCH denser foliage: a monumental, richly layered, lush mature broadleaf crown so dense that almost all internal branches in the crown are concealed by leaves. Keep the lower massive gnarled trunk visible, with irregular flaring roots. Natural oak/banyan-like Yggdrasil architecture, dignified Norse fantasy concept art, convincing botanical structure, detailed rounded asymmetric clusters of foliage and an organically domed crown. No geometric triangle, no conifer, no ghost-shaped block or scalloped curtain. Silhouette must have varied airy small leaf edges, not regularly repeated hanging lobes. COMPOSITION for later UV crop: one full tree centered, trunk base at 96% image height, crown apex at 2% image height; crown's broad lower edge around 45% image height, crown spreads nearly the full image width around mid-height; outer shoulders slope upward toward the top of the crown. Full tree contained in canvas, only slight side margin. The crown apex will later be cropped outside the sky wall by code; do not crop it yourself. Color subdued neutral gray-green foliage and gray-brown bark under diffuse flat daylight, readable organic volume without strong lighting or black outlined details. It will be rendered very faintly against blue sky in-game. No mountains, no landscape, no ground plane, no sky, no background color, no glow, no lightning, no birds, no people, no text, no watermark. All negative spaces outside the tree and beneath its crown beside the trunk must have true alpha transparency.


The original first generation is used, without the foliage refinement, as requested. Roots retain their original height; the runtime landscape alpha mask hides overlaps with the mountain panorama.
