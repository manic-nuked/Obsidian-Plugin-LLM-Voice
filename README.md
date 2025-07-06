# Obsidian AI Assistant Plugin

AI-powered voice dictation, note management, and chat for Obsidian.

## ✨ Features
- **Voice Dictation**: Record and transcribe audio directly into your notes using OpenAI Whisper.
- **AI Tagging**: Automatically generate relevant tags for your notes.
- **Calendar Extraction**: Extract dates/times from notes and create calendar items.
- **Task Generation**: Generate actionable daily task lists from note content.
- **Backlink Suggestions**: Get AI-powered suggestions for internal links.
- **AI Chat Side Panel**: Chat with an AI assistant that can see and analyze all your notes, summarize, search, and help you organize.
- **Note Improvement Workflow**: When you ask the AI to improve/reformat a note, it shows a draft and asks for your approval before updating the actual note.

## 📦 Installation

### For End Users
1. Download/copy the following files into a folder inside your vault's `.obsidian/plugins/` directory (e.g., `AI-assistant`):
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. Enable the plugin in Obsidian under **Settings → Community plugins**.
3. Go to **Settings → AI Assistant** to configure your OpenAI API key and preferences.

### For Developers
1. Clone this repo:
   ```sh
   git clone <your-repo-url>
   cd <your-plugin-folder>
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Build the plugin:
   ```sh
   npm run build
   ```
4. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/AI-assistant/` folder.

## 🚀 How to Deploy and Use in Obsidian

### 1. **Install the Plugin**
- Open your Obsidian vault.
- Go to **Settings → Community plugins**.
- If "Safe mode" is on, turn it off.
- Click **"Open plugins folder"**. This opens `.obsidian/plugins/` in your file explorer.
- Copy the plugin folder (containing `main.js`, `manifest.json`, and `styles.css`) into this directory (e.g., `.obsidian/plugins/AI-assistant/`).
- Return to Obsidian and click **"Reload plugins"** or restart Obsidian.

### 2. **Enable the Plugin**
- In **Settings → Community plugins**, find "AI Assistant" in the list.
- Toggle it on to enable.

### 3. **Configure the Plugin**
- Go to **Settings → AI Assistant**.
- Enter your OpenAI API key and adjust preferences (auto-tag, daily notes folder, model, etc).

### 4. **Using the Plugin**
- **Voice Dictation**: Click the microphone icon in the left ribbon or use the command palette.
- **AI Chat**: Click the message-circle icon in the left ribbon to open the AI chat side panel.
- **Commands**: Use the command palette (Cmd+P) to access all AI features:
  - Open AI Note Assistant
  - AI Tag Current Note
  - Extract Calendar Items
  - Generate Daily Tasks
  - AI Backlink Suggestions
- **Note Improvement**: When you ask the AI to improve/reformat a note, it will show a draft and ask for your approval before updating the note.

## ⚙️ Settings
- **OpenAI API Key**: Required for all AI features.
- **Auto-tag after dictation**: Automatically generate tags after voice dictation.
- **Daily Notes Folder**: Where generated notes and tasks are stored.
- **AI Chat Model**: Choose between GPT-4 and GPT-3.5 Turbo.

## 🧑‍💻 Development
- Source: `main.ts`
- Styles: `styles.css`
- Manifest: `manifest.json`
- Build: `esbuild.config.mjs`, `tsconfig.json`
- Run `npm run build` to generate `main.js`.
- Use `.gitignore` to avoid committing build artifacts and backup files.

## 📝 Notes
- The plugin does **not** upload your notes to any server except OpenAI (for API calls).
- All AI features require a valid OpenAI API key.
- For best results, use GPT-4 for chat and note analysis.

## 📄 License
MIT 