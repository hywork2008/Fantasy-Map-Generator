import { scaleLinear } from "d3";
import { worldContext } from "../context/worldContext";
import { openDialog } from "../ui/dialogs/dialogService";
import type { TemperatureGraphConfig } from "../ui/dialogs/TemperatureGraphDialog";

export function showBurgTemperatureGraph(id: number): void {
  const b = worldContext.pack.burgs[id];
  const lat = worldContext.mapCoordinates.latN! - (b.y / worldContext.graphHeight) * worldContext.mapCoordinates.latT!;
  const burgTemp = worldContext.grid.cells.temp[worldContext.pack.cells.g[b.cell]];
  const prec = worldContext.grid.cells.prec[worldContext.pack.cells.g[b.cell]];

  // prettier-ignore
  const weights = [
    [
      [10.782752257744338, 2.7100404240962126],
      [-2.8226802110591462, 51.62920138583541],
      [-6.6250956268643835, 4.427939197315455],
      [-59.64690518541339, 41.89084162654791],
      [-1.3302059550553835, -3.6964487738450913],
      [-2.5844898544535497, 0.09879268612455298],
      [-5.58528252533573, -0.23426224364501905],
      [26.94531337690372, 20.898158905988907],
      [3.816397481634785, -0.19045424064580757],
      [-4.835697931609101, -10.748232783636434]
    ],
    [
      [
        -2.478952081870123, 0.6405800134306895, -7.136785640930911, -0.2186529024764509, 3.6568435212735424,
        31.446026153530838, -19.91005187482281, 0.2543395274783306, -7.036924569659988, -0.7721371621651565
      ],
      [
        -197.10583739743538, 6.889921141533474, 0.5058941504631129, 7.7667203434606416, -53.74180550086929,
        -15.717331715167001, -61.32068414155791, -2.259728220978728, 35.84049189540032, 94.6157364730977
      ],
      [
        -5.312011591880851, -0.09923148954215096, -1.7132477487917586, -22.55559652066422, 0.4806107280554336,
        -26.5583974109492, 2.0558257347014863, 25.815645234787432, -18.569029876991156, -2.6792003366730035
      ],
      [
        20.706518520569514, 18.344297403881875, 99.52244671131733, -58.53124969563653, -60.74384321042212,
        -80.57540534651835, 7.884792406540866, -144.33871131678563, 80.134199744324, 20.50745285622448
      ],
      [
        -52.88299538575159, -15.782505343805528, 16.63316001054924, 88.09475330556671, -17.619552086641818,
        -19.943999528182427, -120.46286026828177, 19.354752020806302, 43.49422099308949, 28.733924806541363
      ],
      [
        -2.4621368711159897, -1.2074759925679757, -1.5133898639835084, 2.173715352424188, -5.988707597991683,
        3.0234147182203843, 3.3284199340000797, -1.8805161326360575, 5.151910934121654, -1.2540553911612116
      ]
    ],
    [
      [
        -0.3357437479474717, 0.01430651794222215, -0.7927524256670906, 0.2121636229648523, 1.0587803023358318,
        -3.759288325505095
      ],
      [
        -1.1988028704442968, 1.3768997508052783, -3.8480086358278816, 0.5289387340947143, 0.5769459339961177,
        -1.2528318145750772
      ],
      [
        1.0074966649240946, 1.155301164699459, -2.974254371052421, 0.47408176553219467, 0.5939042688615264,
        -0.7631976947131744
      ]
    ]
  ];

  const In1 = [(Math.abs(lat) - 26.950680212887473) / 48.378128506956, (prec - 12.229929140832644) / 29.94402033696607];

  let lastIn: number[] = In1;
  let lstOut: number[] = [];

  for (let levelN = 0; levelN < weights.length; levelN++) {
    const layerN = weights[levelN];
    lstOut = [];
    for (let i = 0; i < layerN.length; i++) {
      lstOut[i] = 0;
      for (let j = 0; j < layerN[i].length; j++) {
        lstOut[i] = lstOut[i] + lastIn[j] * layerN[i][j];
      }
      lstOut[i] = 1 / (1 + Math.exp(-lstOut[i]));
    }
    lastIn = lstOut.slice(0);
  }

  const yearSig = lstOut[0] * 62.9466411977018 + 0.28613807855649165;
  const yearDelTmpSig =
    lstOut[1] * 13.541688670361175 + 0.1414213562373084 > yearSig
      ? yearSig
      : lstOut[1] * 13.541688670361175 + 0.1414213562373084;
  const yearDelTmpMu = lstOut[2] * 15.266666666666667 + 0.6416666666666663;

  const delT = yearDelTmpMu / 2 + (0.5 * yearDelTmpSig) / 2;
  const minT = burgTemp - Math.max(yearSig + delT, 15);
  const maxT = burgTemp + (burgTemp - minT);

  const chartWidth = Math.max(window.innerWidth / 2, 520);
  const chartHeight = 300;
  const xOffset = 60;
  const yOffset = 10;

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  const yscale = scaleLinear().domain([minT, maxT]).range([chartHeight, 0]);

  const tempMean: [number, number][] = [];
  const tempMin: [number, number][] = [];
  const tempMax: [number, number][] = [];

  months.forEach((_month, index) => {
    const rate = index / 11;
    let formTmp = Math.cos(rate * 2 * Math.PI) / 2;
    if (lat > 0) formTmp = -formTmp;

    const x = rate * chartWidth + xOffset;
    const tempAverage = formTmp * yearSig + burgTemp;
    const tempDelta = yearDelTmpMu / 2 + (formTmp * yearDelTmpSig) / 2;

    tempMean.push([x, yscale(tempAverage) + yOffset]);
    tempMin.push([x, yscale(tempAverage - tempDelta) + yOffset]);
    tempMax.push([x, yscale(tempAverage + tempDelta) + yOffset]);
  });

  const config: TemperatureGraphConfig = {
    burgName: b.name ?? "",
    chartWidth,
    chartHeight,
    xOffset,
    yOffset,
    tempMean,
    tempMin,
    tempMax,
    minT,
    maxT,
    months,
    burgTemp
  };
  openDialog("temperatureGraph", config);
}
