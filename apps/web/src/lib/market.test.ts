import { describe, expect, it } from 'vitest';
import {
  marketDetailEntryFromIssue,
  marketEntryFromIssue,
  marketIssuesUrl,
  type GitHubIssueItem,
} from './market';

const manifest = JSON.stringify({
  partiVersion: '0.1.0',
  protocolVersion: 1,
  id: 'game-a',
  name: 'Game A',
  version: '1.0.0',
  packageMode: 'blob',
  entry: { ui: 'index.html', worker: 'room.worker.js' },
});

function issue(overrides: Partial<GitHubIssueItem> = {}): GitHubIssueItem {
  return {
    number: 42,
    title: '[parti-room] alice/game-a',
    html_url: 'https://github.com/glink25/Parti/issues/42',
    state: 'open',
    labels: ['parti-room', 'recommend'],
    body: `\`\`\`parti.room.json\n${manifest}\n\`\`\``,
    ...overrides,
  };
}

describe('marketEntryFromIssue', () => {
  it('parses an active listed issue into a market entry', () => {
    expect(marketEntryFromIssue(issue())).toMatchObject({
      issueNumber: 42,
      ref: 'alice/game-a',
      badges: ['recommend'],
      manifest: { id: 'game-a', name: 'Game A' },
    });
  });

  it('rejects closed, unlisted, pull request, and malformed issues', () => {
    expect(marketEntryFromIssue(issue({ state: 'closed' }))).toBeNull();
    expect(marketEntryFromIssue(issue({ labels: ['recommend'] }))).toBeNull();
    expect(marketEntryFromIssue(issue({ pull_request: {} }))).toBeNull();
    expect(marketEntryFromIssue(issue({ title: '[bug] nope' }))).toBeNull();
  });

  it('requires a valid manifest for single-card details', () => {
    expect(marketDetailEntryFromIssue(issue())).not.toBeNull();
    expect(marketDetailEntryFromIssue(issue({ body: 'manifest pending' }))).toBeNull();
  });
});

describe('marketIssuesUrl', () => {
  it('sorts the market by comment count descending', () => {
    const url = new URL(marketIssuesUrl(3));
    expect(url.searchParams.get('sort')).toBe('comments');
    expect(url.searchParams.get('direction')).toBe('desc');
    expect(url.searchParams.get('page')).toBe('3');
  });
});
