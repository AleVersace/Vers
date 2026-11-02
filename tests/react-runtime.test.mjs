import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, useState } from 'react';
import { renderToString } from 'react-dom/server';

test('installed React and React DOM render a component with hooks together', () => {
  function RollButton() {
    const [roll] = useState('2d6 + 3');
    return createElement('button', { type: 'button' }, `Roll ${roll}`);
  }

  assert.equal(renderToString(createElement(RollButton)),
    '<button type="button">Roll 2d6 + 3</button>');
});
