const fs = require('fs');

const html = `
<div class="attacker-panel">
  <div class="panel-header" role="button" tabindex="0" aria-expanded="true">
    <div class="header-title">
      Attacker Perspective
    </div>
  </div>
  <div class="panel-content" aria-hidden="false">
    <div class="event-list" aria-live="polite">
      <div class="event-item">
        <div class="event-meta">
          <span class="time">13:00</span>
          <span class="source">P1 &rarr; Net</span>
        </div>
        <div class="event-body">
          <span class="operation">[Encrypted]</span>
          <span class="hex-preview">0123456789abcdef0123456789abcdef</span>
        </div>
      </div>
    </div>
    <div class="footer">
      <p class="footer-text">What the attacker sees: only this</p>
      <!-- T16 fills -->
    </div>
  </div>
</div>`;

fs.mkdirSync('.sisyphus/evidence', { recursive: true });
fs.writeFileSync('.sisyphus/evidence/task-10-attacker-no-plaintext.html', html);
