import test from "node:test";
import assert from "node:assert/strict";
import { completion } from "../src/lib/questions.ts";

const assessment = status => ({ status, feedback: "", clarification: "" });

test("пустой бриф не показывает прогресс", () => {
  assert.equal(completion([null, null, null, null]), 0);
});

test("частичный ответ вносит половину одной четверти", () => {
  assert.equal(completion([assessment("partial"), null, null, null]), 13);
});

test("полный и частичный ответы учитываются независимо", () => {
  assert.equal(completion([assessment("complete"), assessment("partial"), null, null]), 38);
});

test("пропуск не маскируется полными ответами", () => {
  assert.equal(completion([assessment("complete"), assessment("complete"), assessment("complete"), assessment("empty")]), 75);
});

test("четыре полных ответа дают 100 процентов", () => {
  assert.equal(completion(Array.from({ length: 4 }, () => assessment("complete"))), 100);
});
