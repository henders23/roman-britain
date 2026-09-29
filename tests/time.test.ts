// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatRange, formatYear, toYear } from '../src/data/time.ts';

test('years of one to four digits, and BC', () => {
  assert.equal(toYear('43'), 43);
  assert.equal(toYear('410'), 410);
  assert.equal(toYear('1066'), 1066);
  assert.equal(toYear('-55'), -55);
  assert.equal(toYear('410-07'), 410.5);
});

test('AD before 1000, dropped from 1000 on', () => {
  assert.equal(formatYear(43), 'AD 43');
  assert.equal(formatYear(999), 'AD 999');
  assert.equal(formatYear(1066), '1066');
  assert.equal(formatYear(-55), '55 BC');
});

test('dates as the brief asks', () => {
  assert.equal(formatDate('122', 'year'), 'AD 122');
  assert.equal(formatDate('43', 'year'), 'AD 43');
  assert.equal(formatDate('410', 'circa'), 'c. AD 410');
  assert.equal(formatRange('610', '640', 'range'), 'between AD 610 and 640');
  assert.equal(formatRange('-60', '-55', 'range'), 'between 60 and 55 BC');
  assert.equal(formatRange('-55', '10', 'range'), 'between 55 BC and AD 10');
  assert.equal(formatRange('950', '1010', 'range'), 'between AD 950 and 1010');
  assert.equal(formatDate('1066-10-14', 'day'), '14 Oct 1066');
  assert.equal(formatDate('410-08', 'month'), 'August AD 410');
});
