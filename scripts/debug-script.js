const fs = require('fs');
const path = require('path');

const latestJson = "../temp/debug/latest.json";
const jsonData = JSON.parse(fs.readFileSync(path.join(__dirname, latestJson), 'utf8'));
const data = jsonData[0].data;
const targets = [];
targets.push([4, 4]);
const militaries = [];
const regs = [];
for (let i = 0; i < targets.length; i++) {
  regs.push(data.states[targets[i][0]].military.find(r => r.i === targets[i][1]));
  console.log(`State ${targets[i][0]}, Reg ${targets[i][1]}:`)
  console.dir(regs[i], { depth: null });
  const sim = data.simulation;
  console.dir(sim.strategicGoals[targets[i][1]], { depth: null });
}


