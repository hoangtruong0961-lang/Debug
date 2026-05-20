const fs = require('fs');
const path = require('path');

const fileUpdates = [
  {
    file: 'src/services/db/indexedDB.ts',
    replacements: [
      { from: /aiModel: 'gemini-3-flash-preview'/g, to: "aiModel: 'gemini-3.1-pro-preview'" },
      { from: /embeddingModel: 'text-embedding-005'/g, to: "embeddingModel: 'gemini-embedding-001'" }
    ]
  },
  {
    file: 'src/services/ai/world-creation/service.ts',
    replacements: [
      { from: /'gemini-3-pro-preview'/g, to: "'gemini-3.1-pro-preview'" }
    ]
  },
  {
    file: 'src/services/ai/client.ts',
    replacements: [
      { from: /"gemini-3-flash-preview"/g, to: '"gemini-3.1-pro-preview"' }
    ]
  },
  {
    file: 'src/services/ai/fanfic/service.ts',
    replacements: [
      { from: /'gemini-3-pro-preview'/g, to: "'gemini-3.1-pro-preview'" },
      { from: /'gemini-3-flash-preview'/g, to: "'gemini-3.1-pro-preview'" }
    ]
  },
  {
    file: 'src/services/ai/storybible/StoryBibleEngine.ts',
    replacements: [
      { from: /"gemini-3\.5-flash"/g, to: '"gemini-3.1-pro-preview"' }
    ]
  },
  {
    file: 'src/services/ai/vectorService.ts',
    replacements: [
      { from: /\['text-embedding-005', 'text-multilingual-embedding-002', 'gemini-embedding-001', 'gemini-embedding-2', 'text-embedding-004'\]/g, to: "['gemini-embedding-001', 'text-embedding-005', 'text-multilingual-embedding-002', 'gemini-embedding-2', 'text-embedding-004']" }
    ]
  },
  {
    file: 'src/components/features/settings/SettingsScreen.tsx',
    replacements: [
      { from: /'text-embedding-005'/g, to: "'gemini-embedding-001'" },
      { from: /"gemini-3.5-flash"/g, to: '"gemini-3.1-pro-preview"' }
    ]
  },
  {
    file: 'src/components/features/world-creation/WorldCreationScreen.tsx',
    replacements: [
      { from: /'gemini-3-pro-preview'/g, to: "'gemini-3.1-pro-preview'" }
    ]
  },
  {
    file: 'src/components/features/main-menu/CardSTAnalyzer.tsx',
    replacements: [
      { from: /"gemini-3-flash-preview"/g, to: '"gemini-3.1-pro-preview"' }
    ]
  },
  {
    file: 'src/components/features/fanfic/FanficScreen.tsx',
    replacements: [
      { from: /'gemini-3-pro-preview'/g, to: "'gemini-3.1-pro-preview'" }
    ]
  },
  {
    file: 'src/components/features/world-creation/EntityForm.tsx',
    replacements: [
      { from: /'gemini-3-pro-preview'/g, to: "'gemini-3.1-pro-preview'" }
    ]
  }
];

for (const { file, replacements } of fileUpdates) {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    for (const rep of replacements) {
      content = content.replace(rep.from, rep.to);
    }
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  } else {
    console.log(`File not found: ${file}`);
  }
}
