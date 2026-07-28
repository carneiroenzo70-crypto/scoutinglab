const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret';
process.env.UPSTASH_URL = 'https://mock';
process.env.UPSTASH_TOKEN = 'mock';

const { orgOfUser, orgOfToken } = require('../api/_auth');

test('orgOfUser : repli sur le nom de compte quand org est absent', () => {
  assert.equal(orgOfUser({ username: 'galions' }), 'galions');
});

test('orgOfUser : renvoie org quand il est présent', () => {
  assert.equal(orgOfUser({ username: 'alan', org: 'galions' }), 'galions');
});

test('orgOfToken : repli sur u pour les tokens émis avant la migration', () => {
  assert.equal(orgOfToken({ u: 'galions' }), 'galions');
});

test('orgOfToken : renvoie org quand il est présent', () => {
  assert.equal(orgOfToken({ u: 'alan', org: 'galions' }), 'galions');
});
