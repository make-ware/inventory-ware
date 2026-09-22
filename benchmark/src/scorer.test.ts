/**
 * Scorer unit tests. Run with `yarn test:benchmark` (node:test via tsx) — the
 * benchmark is not a workspace, so it is not part of the vitest projects.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AnalysisResult } from '@project/shared';
import {
  fieldMatches,
  getField,
  normalize,
  pathSegments,
  scoreCase,
} from './scorer.js';
import type { BenchmarkCase } from './types.js';

function itemRun(overrides: Record<string, unknown> = {}): AnalysisResult {
  return {
    type: 'item',
    data: {
      imageLabel: 'Cordless drill on a workbench',
      imageNotes: 'Well lit',
      item: {
        itemLabel: 'Workshop drill',
        itemNotes: '',
        categoryFunctional: 'Tools',
        categorySpecific: 'Power Tools',
        itemType: 'Drill',
        itemName: 'DeWalt DCD771',
        itemManufacturer: 'DeWalt',
        itemAttributes: [{ name: 'Voltage', value: '20 Volts' }],
        ...overrides,
      },
    },
  } as AnalysisResult;
}

const containerRun: AnalysisResult = {
  type: 'container',
  data: {
    imageLabel: 'Parts bin',
    imageNotes: '',
    container: {
      containerLabel: 'Bin A',
      containerNotes: '',
      containerItems: [
        {
          itemLabel: 'Wood screws',
          itemNotes: '',
          categoryFunctional: 'Materials',
          categorySpecific: 'Fasteners',
          itemType: 'Screw',
          itemName: '',
          itemManufacturer: '',
          itemAttributes: [],
        },
      ],
    },
  },
} as AnalysisResult;

describe('pathSegments', () => {
  it('splits dots and indices', () => {
    assert.deepEqual(pathSegments('container.containerItems[0].itemType'), [
      'container',
      'containerItems',
      '0',
      'itemType',
    ]);
    assert.deepEqual(pathSegments('imageLabel'), ['imageLabel']);
  });
});

describe('getField', () => {
  it('reads a nested string', () => {
    assert.deepEqual(getField(itemRun().data, 'item.itemType'), ['Drill']);
    assert.deepEqual(getField(itemRun().data, 'imageLabel'), [
      'Cordless drill on a workbench',
    ]);
  });

  it('renders attribute pairs as "name: value"', () => {
    assert.deepEqual(getField(itemRun().data, 'item.itemAttributes'), [
      'Voltage: 20 Volts',
    ]);
  });

  it('indexes into arrays', () => {
    assert.deepEqual(
      getField(containerRun.data, 'container.containerItems[0].itemType'),
      ['Screw']
    );
  });

  it('returns nothing for a path the result does not have', () => {
    assert.deepEqual(getField(containerRun.data, 'item.itemType'), []);
    assert.deepEqual(getField(itemRun().data, 'item.nope.deeper'), []);
  });
});

describe('normalize', () => {
  it('treats hyphens, spaces and case as equivalent', () => {
    assert.equal(normalize('Power Tools'), 'power tools');
    assert.equal(normalize('power-tools'), 'power tools');
    assert.equal(normalize('  POWER   TOOLS '), 'power tools');
  });
});

describe('fieldMatches', () => {
  it('matches case- and separator-insensitively', () => {
    assert.equal(fieldMatches(['Power Tools'], ['power-tools']), true);
  });

  it('accepts an actual value that is longer than the term', () => {
    assert.equal(fieldMatches(['Cordless Drill'], ['Drill']), true);
    assert.equal(fieldMatches(['Voltage: 20 Volts'], ['Voltage']), true);
  });

  it('rejects a term that is longer than the actual value', () => {
    assert.equal(fieldMatches(['Drill'], ['Hammer Drill']), false);
  });

  it('never matches an empty expectation list', () => {
    assert.equal(fieldMatches(['Drill'], []), false);
    assert.equal(fieldMatches(['Drill'], ['   ']), false);
  });
});

describe('scoreCase', () => {
  const benchmarkCase: BenchmarkCase = {
    name: 'drill',
    image: 'cases/images/drill.jpg',
    expectations: [
      { field: 'item.itemType', expected: ['Drill'] },
      { field: 'item.itemManufacturer', expected: ['Makita'] },
    ],
  };

  it('counts hits across runs', () => {
    const { scores, avgScore } = scoreCase(benchmarkCase, [
      itemRun(),
      itemRun({ itemType: 'Screwdriver' }),
      itemRun(),
    ]);

    assert.equal(scores[0].hits, 2);
    assert.equal(scores[0].total, 3);
    assert.equal(scores[0].score, 0.6667);
    assert.equal(scores[1].hits, 0);
    assert.equal(avgScore, 0.3334);
  });

  it('notes runs that came back as the other analysis type', () => {
    const { scores } = scoreCase(benchmarkCase, [itemRun(), containerRun]);
    assert.equal(scores[0].hits, 1);
    assert.match(scores[0].note ?? '', /1\/2 run\(s\) were classified/);
  });

  it('scores an empty expectation list as 0 and says why', () => {
    const { scores } = scoreCase(
      {
        ...benchmarkCase,
        expectations: [{ field: 'item.itemType', expected: [] }],
      },
      [itemRun()]
    );
    assert.equal(scores[0].score, 0);
    assert.match(scores[0].note ?? '', /no expected terms/);
  });

  it('scores 0 without dividing by zero when every run failed', () => {
    const { scores, avgScore } = scoreCase(benchmarkCase, []);
    assert.equal(scores[0].total, 0);
    assert.equal(scores[0].score, 0);
    assert.equal(avgScore, 0);
  });
});
