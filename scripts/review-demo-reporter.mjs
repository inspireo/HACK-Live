import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export default class ReviewDemoReporter {
  tests = [];
  onBegin(config) {
    this.outputDir = config.projects[0].outputDir;
    this.startedAt = new Date().toISOString();
    this.sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    this.sourceTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
    this.sourceDiff = execFileSync('git', ['diff', 'HEAD', '--', 'src', 'server', 'shared', 'tests', 'scripts', 'playwright.config.ts'], { encoding: 'utf8' });
  }
  onTestEnd(testCase, result) {
    this.tests.push({ file: testCase.location.file, title: testCase.title, status: result.status,
      expectedStatus: testCase.expectedStatus, retry: result.retry, durationMs: result.duration,
      attachments: result.attachments.filter(attachment => attachment.path).map(attachment => ({ name: attachment.name, contentType: attachment.contentType, path: resolve(attachment.path) })),
      errors: result.errors.map(error => error.message),
    });
  }
  onEnd(result) {
    writeFileSync(resolve(this.outputDir, 'review-recording-report.json'), JSON.stringify({
      version: 1, status: result.status, startedAt: this.startedAt, endedAt: new Date().toISOString(),
      sourceSha: this.sourceSha, sourceTree: this.sourceTree, sourceDiff: this.sourceDiff,
      syntheticData: true, actualApp: true, physicalDevice: false,
      browserMode: 'Chromium, WebShare disabled by browser feature flag; real clipboard permissions',
      tests: this.tests,
    }, null, 2));
  }
}
