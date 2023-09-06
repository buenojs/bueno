import { isOdd } from "https://deno.land/x/is_odd@0.1.2/index.ts";

let a: number = 5;

console.log("Hello bueno", a);

class ThisIsClass {
  myClassProp = "dog";
  dogName = "egg";
}

class Extended extends ThisIsClass {}

const classInstance = new ThisIsClass();
const class2Instance = new Extended();

function* generator() {
}

console.log(ThisIsClass, classInstance);

const set = new Set([
  1,
  2,
  3,
  { test: 123 },
  4,
  { gasjfhasfasjkfkajsf: 123123 },
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
]);
const shortArr = [1, 2, 3, 4];
const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const arrWShit = [
  { uno: "dos", tres: "quatro" },
  2,
  3,
  [1, 2, 3],
  "hi",
  10,
];

const map = new Map<any, any>([
  ["k", "v"],
  ["hdk", "v3"],
  ["k", 3],
  ["kdhf", {}],
  ["kj", "v"],
]);

const longmap = new Map<any, any>([
  ["k", "v"],
  ["hdk", "v3"],
  ["hahgsfdk", "v3"],
  ["hdk4k4", "v3hh"],
  ["2k", 53n],
  ["kdhf", {}],
  ["gggkj", "v"],
]);

const wmap = new WeakMap<any, any>([
  [[12, 3, 4], "hi"],
  [[12, 3, 4], { hello: "123" }],
  [[12, 4], "hfgfi"],
]);

const typedArr = new Uint8Array([
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  234,
  23463,
  7412,
  2,
  12,
  11,
]);

console.log("deep obj:", {
  hello: {
    world: "how are you?",
    im: {
      going: {
        even: "deeper",
      },
      fn() {
      },
      num: 5,
    },
  },
  class: ThisIsClass,
  classInst: classInstance,
  class2Instance,
  bigI: 10n,
  generator,
  Extended,
  biggerI: 1124582358092850923859023859023859082309539058209358902350n,
  symbol: Symbol("AWOOGA"),
  num: 2,
  map,
  longmap,
  wmap,
  set,
  shortArr,
  arr,
  arrWShit,
  str: "HELLO",
  bool: false,
  booltrue: true,
  typedArr,
  promise: new Promise((x) => {}),
  resolvedPromise: new Promise<string>((res) => {
    res("RESOLVED!");
  }),
  rejectedPromise: new Promise<void>((_, rej) => {
    rej("REJECTED!");
  }).catch(() => "rejected"),
  proxy: new Proxy({ hello: 123 }, {}),
});

console.log("pretty object: %o", {
  hello: "world",
});

const circular = {};

circular.ref = circular;

console.log(circular);

const map2 = new Map();
map2.set("x", map2);
console.time("console apis");
console.log(undefined);
console.log(null);

console.error("Hello bueno");

console.error("is a even?", isOdd(a));
console.trace("test %o", { hello: "world" });
console.assert(false, "dog");

console.timeLog("console apis", { test: "obj" });

for (let i = 0; i < 3; ++i) {
  console.count();
  console.count("dog");
}

console.countReset("dog");

for (let i = 0; i < 3; ++i) {
  console.count();
  console.count("dog");
}

console.countReset("cat");
console.timeEnd("console apis");

console.time("console apis");
console.timeEnd("console apis");

console.log("This is the outer level");
console.group();
console.log("Level 2");
console.groupCollapsed();
console.log("Level 3");
console.warn("More of level 3");
console.groupEnd();
console.log("Back to level 2");
console.groupEnd();
console.log("Back to the outer level");

console.group();
console.group();
console.group();
console.table([
  ["Tyrone", "Jones"],
  ["Janet", "Smith"],
  ["Maria", "Cruz"],
]);
console.groupEnd();
console.groupEnd();
console.groupEnd();

console.table(["hello", "world"]);

function Person(firstName, lastName) {
  this.firstName = firstName;
  this.lastName = lastName;
}

const tyrone = new Person("Tyrone", "Jones");
const janet = new Person("Janet", "Smith");
const maria = new Person("Maria", "Cruz");

console.table([tyrone, janet, maria], ["firstName"]);
console.table([tyrone, janet, maria], ["lastName"]);
console.table([tyrone, janet, maria], ["firstName", "lastName"]);

const start = performance.now();
console.log(start);

for (let i = 0; i < 100_000; ++i) {
  Math.random();
}

const end = performance.now();
console.log(end);
console.log("Elapsed:", end - start);

console.log("ORIGIN:", performance.timeOrigin);
console.log(
  "date-performance.timeOrigin vs performance.now",
  Date.now() - performance.timeOrigin,
  performance.now(),
);

console.log(Date.now());
