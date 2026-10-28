import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { catalog, catalogs, translate, translateError } from '../lib/i18n/translate.ts';
import { localizeRollBreakdown } from '../lib/i18n/rolls.ts';
import { rollMacroDice, macroRollComparisonSummary } from '../lib/vers/macro-roll.ts';
import { getLanguage, getServerLanguage, setLanguage, subscribeLanguage, LANGUAGE_STORAGE_KEY, t, uiLocale } from '../lib/i18n/store.ts';

import { SUPPORTED_LANGUAGES, isLanguage, languageDetails } from '../lib/i18n/languages.ts';
import * as languageStore from '../lib/i18n/store.ts';

const require = createRequire(import.meta.url);
const table = readFileSync(new URL('../app/VersTable.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('VersTable.tsx', table, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const visit = (node, callback) => { callback(node); ts.forEachChild(node, child => visit(child, callback)); };

// Use the actual JSX and event handler for the inspector, not a copied implementation.
function savingThrowInputs(language, token, updates) {
  let expression;
  visit(ast, node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'SAVING_THROWS.map'
        && node.getText(ast).includes('selectedToken.saving_throws')) expression = node.getText(ast);
  });
  assert.ok(expression, 'inspector iterates canonical saving-throw identifiers');
  const compiled = ts.transpileModule(`export const inputs = ${expression}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  new Function('exports', 'require', 'SAVING_THROWS', 't', 'selectedToken', 'optimisticTokenPatchesRef', 'queueTokenUpdate', 'toNumber', 'flushTokenUpdates', compiled)(
    exports, require, ['FOR', 'DES', 'COS', 'INT', 'SAG', 'CAR'], (copy, values) => translate(copy, language, values), token,
    { current: new Map() }, (id, patch) => updates.push({ id, patch }), Number, () => {},
  );
  return exports.inputs;
}

test('every UI translation key has complete EN/FR/DE copy and keeps all interpolation parameters', () => {
  assert.ok(Object.keys(catalog).length > 450);
  for (const [language, entries] of Object.entries(catalogs)) {
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(catalog).sort(), `${language}: complete catalog`);
    for (const [key, value] of Object.entries(entries)) {
      assert.ok(value.trim(), `${language}: ${key}`);
      const parameters = text => [...text.matchAll(/\{p\d+\}/g)].map(match => match[0]).sort();
      assert.deepEqual(parameters(value), parameters(key), `${language}: ${key}`);
    }
  }
  for (const file of ['VersApp', 'VersTable', 'MacroDockRow', 'MacroRollModeControls', 'SourceLink', 'LanguageToggle']) {
    const source = readFileSync(new URL(`../app/${file}.tsx`, import.meta.url), 'utf8');
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    visit(tree, node => {
      if (ts.isCallExpression(node) && node.expression.getText(tree) === 't'
          && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const key = node.arguments[0].text;
        assert.ok(Object.hasOwn(catalog, key) || Object.hasOwn(catalog, key.trim()), `${file}: ${key}`);
      }
    });
  }
});

test('interpolation preserves user-authored names even when they match a translated word', () => {
  assert.equal(translate('Macro di {p0}', 'en', { p0: 'Fuoco' }), 'Macros for Fuoco');
  assert.equal(translate('Macro di {p0}', 'it', { p0: 'Fuoco' }), 'Macro di Fuoco');
  assert.equal(translate('Elimina {p0}', 'en', { p0: '<script>{p1}</script>' }), 'Delete <script>{p1}</script>');
  assert.equal(translate('toString', 'en'), 'toString');
  assert.equal(translate('constructor', 'it'), 'constructor');
  assert.equal(translate('  Casuale sconosciuto  ', 'en'), '  Casuale sconosciuto  ');
  assert.equal(translate(' di ', 'en'), ' of ');
});

test('notifications, parameterized validations and provider errors switch languages', () => {
  assert.equal(translate('Macro spostata in “Fuoco”', 'en'), 'Macro moved to “Fuoco”');
  const error = 'Il nome della macro può contenere al massimo 64 caratteri.';
  assert.equal(translateError(error, 'it'), error);
  assert.equal(translateError(error, 'en'), 'The macro name can contain up to 64 characters.');
  assert.equal(translateError('Firebase: Error (auth/popup-blocked).', 'en'), 'Allow popups to sign in with Google.');
  assert.equal(translateError('Firebase: Error (auth/popup-closed-by-user).', 'it'), 'Accesso annullato. Riprova quando vuoi.');
  assert.equal(translateError('unrecognized database diagnostic', 'en'), 'The operation failed. Please try again.');
});

test('Italian remains the server default and browser preference changes notify without reload', () => {
  const originalWindow = globalThis.window;
  const writes = [], events = [];
  globalThis.window = { localStorage: { setItem: (key, value) => writes.push([key, value]) } };
  setLanguage('it', false);
  const unsubscribe = subscribeLanguage(() => events.push(getLanguage()));
  try {
    setLanguage('en');
    assert.equal(getLanguage(), 'en');
    assert.equal(getServerLanguage(), 'it');
    assert.equal(t('Tiri salvezza'), 'Saving throws');
    assert.equal(uiLocale(), 'en-US');
    assert.deepEqual(writes, [[LANGUAGE_STORAGE_KEY, 'en']]);
    setLanguage('en'); // No redundant render.
    setLanguage('invalid');
    assert.deepEqual(events, ['en']);
    globalThis.window.localStorage.setItem = () => { throw new Error('storage blocked'); };
    setLanguage('it');
    assert.equal(getLanguage(), 'it');
    assert.equal(uiLocale(), 'it-IT');
    assert.deepEqual(events, ['en', 'it']);
    unsubscribe();
    setLanguage('en', false);
    assert.deepEqual(events, ['en', 'it']);
  } finally {
    unsubscribe();
    setLanguage('it', false);
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  }
  assert.equal(getLanguage(), 'it');
});

test('English saving-throw labels read and update the original keys without losing other stats', () => {
  const token = { id: 'token', saving_throws: { FOR: 2, DES: 4, COS: 3, INT: 1, SAG: 5, CAR: -1 } };
  const updates = [];
  const italian = savingThrowInputs('it', token, updates);
  const english = savingThrowInputs('en', token, updates);
  assert.deepEqual(italian.map(label => label.props.children[0]), ['FOR', 'DES', 'COS', 'INT', 'SAG', 'CAR']);
  assert.deepEqual(english.map(label => label.props.children[0]), ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);
  assert.deepEqual(english.map(label => label.props.children[1].props.value), [2, 4, 3, 1, 5, -1]);
  assert.deepEqual(updates, []);
  english[1].props.children[1].props.onChange({ target: { value: '7' } });
  assert.deepEqual(updates, [{ id: 'token', patch: { saving_throws: { ...token.saving_throws, DES: 7 } } }]);
  assert.equal(token.saving_throws.DES, 4);
});

test('roll localization preserves ADV/DIS decisions, bonuses, results and canonical stored text', () => {
  const macro = { dice_sides: [6, 6], bonuses: [3], temporary_dice_sides: [4], temporary_bonuses: [2], is_damage_macro: false, dice_damage_types: [], bonus_damage_types: [], temporary_dice_damage_types: [], temporary_bonus_damage_types: [] };
  for (const mode of ['adv', 'dis']) {
    const values = [1, 6, 4, 4, 2]; let draws = 0;
    const roll = rollMacroDice(macro, mode, () => values[draws++]);
    const snapshot = JSON.stringify(roll);
    const original = `${macroRollComparisonSummary(roll.comparison)} · d6: 4 [Fuoco] · BT + 2 [Freddo]`;
    const localized = localizeRollBreakdown(original, 'en');
    assert.match(localized, new RegExp(`${mode.toUpperCase()} · dice 7 / 8 → roll ${mode === 'adv' ? 2 : 1}: ${mode === 'adv' ? 8 : 7}`));
    assert.match(localized, /d6: 4 \[Fire\] · TB \+ 2 \[Cold\]/);
    assert.equal(localizeRollBreakdown(original, 'it'), original);
    assert.equal(JSON.stringify(roll), snapshot);
    assert.equal(draws, 5, 'localizing never rolls again or duplicates temporary dice');
    assert.equal(roll.total, mode === 'adv' ? 15 : 14);
  }
});

test('French and German preserve interpolated names, whitespace and safe provider errors', () => {
  const cases = {
    fr: ['Macros de Fuoco', 'Macro déplacée dans « Fuoco »', 'Le nom de la macro peut contenir 64 caractères au maximum.', 'L’opération a échoué. Réessayez.'],
    de: ['Makros von Fuoco', 'Makro nach „Fuoco“ verschoben', 'Der Makroname darf höchstens 64 Zeichen enthalten.', 'Der Vorgang ist fehlgeschlagen. Bitte versuche es erneut.'],
  };
  for (const [language, [name, notification, validation, fallback]] of Object.entries(cases)) {
    assert.equal(translate('Macro di {p0}', language, { p0: 'Fuoco' }), name);
    assert.equal(translate('Macro spostata in “Fuoco”', language), notification);
    assert.equal(translateError('Il nome della macro può contenere al massimo 64 caratteri.', language), validation);
    assert.equal(translateError('private provider detail with a token', language), fallback);
    assert.ok(!translateError('Firebase: Error (auth/popup-blocked).', language).includes('Firebase'));
    assert.equal(translate('toString', language), 'toString');
    assert.equal(translate('constructor', language), 'constructor');
    assert.equal(translate('  My character  ', language), '  My character  ');
    assert.equal(translate(' di ', language), language === 'fr' ? ' de ' : ' von ');
    assert.ok(translate('Elimina {p0}', language, { p0: '<script>{p1}</script>' }).includes('<script>{p1}</script>'));
  }
});

test('French and German saving throws edit canonical stats without touching other fields', () => {
  for (const [language, labels] of Object.entries({ fr: ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'], de: ['STÄ', 'GES', 'KON', 'INT', 'WEI', 'CHA'] })) {
    const token = { id: 'token', saving_throws: { FOR: 2, DES: 4, COS: 3, INT: 1, SAG: 5, CAR: -1 } };
    const updates = [], snapshot = JSON.stringify(token);
    const inputs = savingThrowInputs(language, token, updates);
    assert.deepEqual(inputs.map(label => label.props.children[0]), labels);
    assert.deepEqual(inputs.map(label => label.props.children[1].props.value), [2, 4, 3, 1, 5, -1]);
    assert.deepEqual(updates, []);
    inputs[4].props.children[1].props.onChange({ target: { value: '8' } });
    assert.deepEqual(updates, [{ id: 'token', patch: { saving_throws: { ...token.saving_throws, SAG: 8 } } }]);
    assert.equal(JSON.stringify(token), snapshot);
  }
});

test('French and German roll logs preserve both totals, selected roll and all temporary bonuses', () => {
  const macro = { dice_sides: [6, 6], bonuses: [3], temporary_dice_sides: [4], temporary_bonuses: [2], is_damage_macro: false, dice_damage_types: [], bonus_damage_types: [], temporary_dice_damage_types: [], temporary_bonus_damage_types: [] };
  for (const mode of ['adv', 'dis']) {
    const values = [1, 6, 4, 4, 2]; let draws = 0;
    const roll = rollMacroDice(macro, mode, () => values[draws++]);
    const snapshot = JSON.stringify(roll);
    const original = `${macroRollComparisonSummary(roll.comparison)} · d6: 4 [Fuoco] · BT + 2 [Freddo]`;
    const chosen = mode === 'adv' ? '2: 8' : '1: 7';
    assert.equal(localizeRollBreakdown(original, 'fr'), `${mode.toUpperCase()} · dés 7 / 8 → jet ${chosen} · d6: 4 [Feu] · BT + 2 [Froid]`);
    assert.equal(localizeRollBreakdown(original, 'de'), `${mode.toUpperCase()} · Würfel 7 / 8 → Wurf ${chosen} · d6: 4 [Feuer] · TB + 2 [Kälte]`);
    assert.equal(JSON.stringify(roll), snapshot);
    assert.equal(draws, 5);
    assert.equal(roll.total, mode === 'adv' ? 15 : 14);
  }
});

// Execute the real client component's preference effect and button callbacks.
function languageComponents(effects) {
  const source = readFileSync(new URL('../app/LanguageToggle.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const imports = name => {
    if (name === 'react') return { useEffect: fn => effects.push(fn), useSyncExternalStore: (_, getSnapshot) => getSnapshot() };
    if (name === '@/lib/i18n/store') return languageStore;
    if (name === '@/lib/i18n/languages') return { SUPPORTED_LANGUAGES, isLanguage, languageDetails };
    return require(name);
  };
  new Function('exports', 'require', compiled)(exports, imports);
  return exports;
}

test('four-language selector restores preferences, syncs other tabs and keeps native labels', () => {
  const originalWindow = globalThis.window;
  const writes = [], listeners = new Map();
  globalThis.window = {
    localStorage: { getItem: () => 'fr', setItem: (key, value) => writes.push([key, value]) },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  };
  setLanguage('it', false);
  let cleanup;
  try {
    const effects = [];
    const components = languageComponents(effects);
    components.LanguageEffects();
    cleanup = effects[0]();
    assert.equal(getLanguage(), 'fr');
    assert.deepEqual(writes, [], 'restoring a preference must not rewrite it');
    const selector = components.LanguageToggle().props.children;
    const buttons = selector[0].props.children;
    const compact = selector[1];
    assert.deepEqual(compact.props.children.map(option => option.props.children), ['Italiano', 'English', 'Français', 'Deutsch']);
    assert.deepEqual(buttons.map(button => button.props['aria-label']), ['Italiano', 'English', 'Français', 'Deutsch']);
    assert.deepEqual(buttons.map(button => button.props.lang), ['it', 'en', 'fr', 'de']);
    assert.deepEqual(buttons.map(button => button.props['aria-pressed']), [false, false, true, false]);
    buttons[3].props.onClick();
    assert.equal(getLanguage(), 'de');
    assert.equal(uiLocale(), 'de-DE');
    assert.deepEqual(writes, [[LANGUAGE_STORAGE_KEY, 'de']]);
    listeners.get('storage')({ key: LANGUAGE_STORAGE_KEY, newValue: 'fr' });
    assert.equal(getLanguage(), 'fr');
    assert.equal(uiLocale(), 'fr-FR');
    listeners.get('storage')({ key: LANGUAGE_STORAGE_KEY, newValue: 'invalid' });
    listeners.get('storage')({ key: 'unrelated', newValue: 'en' });
    assert.equal(getLanguage(), 'fr');
    assert.deepEqual(writes, [[LANGUAGE_STORAGE_KEY, 'de']], 'cross-tab updates must not loop');
    globalThis.window.localStorage.setItem = () => { throw new Error('storage blocked'); };
    buttons[3].props.onClick();
    assert.equal(getLanguage(), 'de');
    compact.props.onChange({ target: { value: 'fr' } });
    assert.equal(getLanguage(), 'fr');
    compact.props.onChange({ target: { value: 'invalid' } });
    assert.equal(getLanguage(), 'fr');
    assert.equal(getServerLanguage(), 'it');
  } finally {
    cleanup?.();
    setLanguage('it', false);
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  }
  assert.equal(listeners.size, 0);
});

test('French and German ADV tooltips translate the base-dice fragment and retain single bonuses', () => {
  const source = readFileSync(new URL('../app/MacroRollModeControls.tsx', import.meta.url), 'utf8');
  for (const language of ['fr', 'de']) {
    const compiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const exports = {};
    new Function('exports', 'require', compiled)(exports, name => {
      if (name === '@/lib/i18n/store') return { t: (key, values) => translate(key, language, values) };
      if (name === '@/lib/vers/macro-roll') return { toggleMacroRollMode: () => {} };
      return require(name);
    });
    const buttons = exports.MacroRollModeOptions({ mode: 'normal', onChange: () => {} }).props.children;
    assert.equal(buttons[0].props.title, language === 'fr'
      ? 'Lancez deux fois les dés de base : gardez le total le plus élevé. Les bonus et bonus temporaires ne s’appliquent qu’une fois.'
      : 'Wirf die Würfel der Grundformel zweimal: Wähle die höhere Summe. Boni und temporäre Boni werden nur einmal angewendet.');
  }
});
