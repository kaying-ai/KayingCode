// Compact golden fixture for t3m audit. Lines are copied/simplified from the
// Turbo Tails bundle so pattern changes can be regression-tested without the
// 33 MB source. Keep the key tokens used by the replay evaluation.
var nb = ((s) => (s === "old" ? "" : s || "a"))(
  (new URLSearchParams(location.search).get("char") || "").toLowerCase()
);
ib = (s, e) => nb && S0[e] && s["kart_" + e + "_r13" + nb];
const model = assets["kart_fox_r13a"];
function rb(s, e) {
  let t = ib(s, e.id);
  if (!t) return null;
}
function ab(s, e) {
  let t = rb(s, e);
  if (t) return t;
  let r = s["driver_" + e.id].clone(true);
}
material.onBeforeCompile = (shader) => {
  shader.fragmentShader = "uniform float uFace; uniform sampler2D uDecal;";
};
const uNeckM = new Matrix3();
this.wheelSpin += (this.speed * e) / 0.27;
a.name.startsWith("Wob_");
this.blinkT -= e;
t.head.rotation.y = this.steerVis * 0.45 + this.lookY;
let h = (Ci.get("tsun") || "").split(",");
Ns.shadow.bias = -2e-4;
Ns.shadow.normalBias = 0.06;
