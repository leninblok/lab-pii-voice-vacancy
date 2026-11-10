// Run against a running, configured local server: node tests/integration/editorial-eval.mjs
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3100';
async function update(document, message, {activeTopic = "tasks", previousQuestion = ""} = {}) {
  const response = await fetch(`${base}/api/update`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({document,message,activeTopic,previousQuestion,manuallyEdited:[],revision:1,operationId:crypto.randomUUID(),mode:'update'})});
  const body = await response.json(); if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`); return body;
}
const combined = value => JSON.stringify(value.document).toLowerCase();
const speech = await update({title:'Сотрудник',blocks:[]},'Он будет по помойкам шариться.');
assert.match(combined(speech), /помойк|мусор|контейнер/); assert.doesNotMatch(combined(speech), /конкурент|рес[её]рч|исследовани[ея] рын/); console.log('Разговорная речь: смысл сохранён');
const conflict = await update({title:'Дизайнер',blocks:[{id:'a',type:'paragraph',text:'Работа в офисе.'}]},'Только удалённо.');
assert.match(combined(conflict), /удал[её]н/); assert.doesNotMatch(combined(conflict), /офис/); console.log('Противоречие: новое условие учтено');
const multi = await update({title:'',blocks:[]},'Нужен аналитик, каждый день строит отчёты в SQL, сейчас обновляем дашборд продаж, через полгода — прогнозирование, работаем удалённо.');
for (const topic of ['tasks','project','future','skills']) assert.ok(multi.scores[topic].score > 0, `Тема ${topic} должна учитывать данные ответа`);
console.log('Одна реплика: информация учтена в четырёх темах');

const minimal = await update({title:'',blocks:[]},'Нужен продуктовый дизайнер');
assert.equal(minimal.document.blocks.length,0,'Нельзя выдумывать обязанности, если названа только должность');
for (const topic of ['tasks','project','future','skills']) assert.equal(minimal.scores[topic].score,0,`Тема ${topic} не раскрыта`);
console.log('Короткий ответ: создано только название');

const simpleRole = await update({title:'',blocks:[]},'дворник');
assert.match(simpleRole.document.title.toLowerCase(), /^ищем[\s\u00a0]+дворника$/u);
assert.equal(simpleRole.document.blocks.length,0,'Одна должность не подтверждает обязанности');
console.log('Название: естественный заголовок вакансии без выдуманных фактов');
const oldQuestion = 'Над чем он будет работать в ближайшие полгода?';
const followup = await update({title:'Ищем дворника',blocks:[{id:'a',type:'paragraph',text:'Каждое утро подметать двор у офиса.'}]},'В ближайшие полгода будет каждый день подметать двор в семь утра.',{activeTopic:'project',previousQuestion:oldQuestion});
assert.notEqual(followup.question.toLowerCase().replace(/[^а-яёa-z0-9]/gi,''),oldQuestion.toLowerCase().replace(/[^а-яёa-z0-9]/gi,''),'Уже заданный вопрос не должен повторяться');
assert.ok(followup.document.blocks.length <= 3,'Близкие факты не должны дробиться на отдельные абзацы');
console.log('Следующий вопрос: не повторяет уже заданный, связанные факты не дробятся');

// Исторический регрессионный сценарий: две записи об одной работе содержат
// дополнительные детали, которые нельзя потерять при объединении.
const organized = await update({title:'Ищем дворника',blocks:[{id:'a',type:'paragraph',text:'Каждое утро подметать двор у офиса.'}]},'Работа будет заключаться в том, чтобы в семь утра выходить и мести двор. Следить, чтобы у входа не было мусора, и убирать листья осенью. Работаем по будням.',{activeTopic:'tasks',previousQuestion:'Какие задачи будет выполнять человек?'});
const body = organized.document.blocks.map(b => b.text).join('\n').toLowerCase();
const duties = organized.document.blocks.find(b => b.type === 'list');
assert.ok(organized.document.blocks.some(b => b.type === 'heading'),'У обязанностей должен быть смысловой заголовок');
assert.ok(duties,'Несколько обязанностей должны быть оформлены одним списком');
const lines = duties.text.split('\n').filter(Boolean);
assert.ok(lines.length >= 3,'Ожидаются как минимум три разные обязанности');
assert.equal(lines.filter(line => /подмет|мести|вымет/.test(line)).length,1,'Подметание и метение двора — одна обязанность, а не повтор');
for (const [label, pattern] of [['офис',/офис/],['время',/семь|7/],['утро',/утр/],['вход',/вход/],['мусор',/мусор/],['листья',/лист|листь/],['осень',/осен/],['будни',/будн/]]) assert.match(body,pattern,`Потеряна деталь: ${label}`);
assert.doesNotMatch(body,/заключаться в том|зарплат|коллектив|опыт работы|преми|соцпакет/,'Нельзя добавлять непереданные условия и требования');
console.log('Дубли и структура: детали сохранены, обязанности сгруппированы в список');
