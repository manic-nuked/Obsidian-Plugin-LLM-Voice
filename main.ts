import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, ItemView, WorkspaceLeaf } from 'obsidian';
import moment from 'moment';

interface AIAssistantSettings {
    openaiApiKey: string;
    autoTagEnabled: boolean;
    autoCalendarEnabled: boolean;
    autoTaskEnabled: boolean;
    dailyNotesFolder: string;
    chatModel: string;
}

const DEFAULT_SETTINGS: AIAssistantSettings = {
    openaiApiKey: '',
    autoTagEnabled: true,
    autoCalendarEnabled: true,
    autoTaskEnabled: true,
    dailyNotesFolder: 'Daily Notes',
    chatModel: 'gpt-4'
}

// AI Chat Side Panel
class AIChatView extends ItemView {
    private messagesContainer: HTMLElement;
    private inputContainer: HTMLElement;
    private messageInput: HTMLTextAreaElement;
    private sendButton: HTMLButtonElement;
    private plugin: AIAssistantPlugin;
    private isLoading = false;
    private conversationHistory: Array<{ role: 'user' | 'assistant', content: string }> = [];

    constructor(leaf: WorkspaceLeaf, plugin: AIAssistantPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return 'ai-chat-view';
    }

    getDisplayText(): string {
        return 'AI Assistant';
    }

    getIcon(): string {
        return 'message-circle';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.createEl('h4', { text: '🤖 AI Note Assistant' });

        // Messages container
        this.messagesContainer = container.createEl('div', { cls: 'ai-chat-messages' });
        
        // Welcome message
        this.addMessage('assistant', 'Hello! I can help you with your Obsidian notes. I can see all your notes and can help you:\n\n• Ask questions about your notes\n• Summarize collections of notes\n• Find related content\n• Organize and sort notes\n• Analyze patterns in your writing\n\nWhat would you like to know about your notes?');

        // Input area
        this.inputContainer = container.createEl('div', { cls: 'ai-chat-input-container' });
        
        this.messageInput = this.inputContainer.createEl('textarea', {
            placeholder: 'Ask me about your notes...',
            cls: 'ai-chat-input'
        });
        this.messageInput.rows = 3;
        
        this.sendButton = this.inputContainer.createEl('button', {
            text: 'Send',
            cls: 'ai-chat-send-btn'
        });

        // Event listeners
        this.sendButton.onclick = () => this.sendMessage();
        this.messageInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        };

        // Focus input
        this.messageInput.focus();
    }

    private addMessage(role: 'user' | 'assistant', content: string, improveNoteAction?: { filename: string, improvedContent: string }) {
        const messageEl = this.messagesContainer.createEl('div', {
            cls: `ai-chat-message ai-chat-${role}`
        });

        const avatar = messageEl.createEl('div', { cls: 'ai-chat-avatar' });
        avatar.innerHTML = role === 'user' ? '👤' : '🤖';

        // Make both user and assistant messages selectable/copyable
        const contentEl = messageEl.createEl('div', { cls: 'ai-chat-content' });
        contentEl.innerHTML = content.replace(/\n/g, '<br>');

        // Add copy button for assistant messages
        if (role === 'assistant') {
            const copyBtn = messageEl.createEl('button', {
                text: '📋',
                cls: 'ai-chat-copy-btn',
                title: 'Copy to clipboard'
            });
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(content).then(() => {
                    new Notice('Copied to clipboard!');
                });
            };
        }

        // If this is an improve note action, add Yes/No buttons AFTER the content
        if (improveNoteAction) {
            const actionContainer = messageEl.createEl('div', { cls: 'ai-chat-action-btns' });
            contentEl.insertAdjacentElement('afterend', actionContainer);
            const yesBtn = actionContainer.createEl('button', { text: 'Yes', cls: 'ai-chat-action-yes' });
            const noBtn = actionContainer.createEl('button', { text: 'No', cls: 'ai-chat-action-no' });
            actionContainer.createEl('span', { text: 'Update the actual note with this version?' });
            yesBtn.onclick = async () => {
                yesBtn.disabled = true;
                noBtn.disabled = true;
                try {
                    await this.plugin.createOrUpdateNote(improveNoteAction.filename, improveNoteAction.improvedContent);
                    new Notice(`✅ Updated note: ${improveNoteAction.filename}`);
                    actionContainer.createEl('span', { text: ' (Note updated!)', cls: 'ai-chat-action-confirm' });
                } catch (err) {
                    console.error('Failed to update note:', err);
                    new Notice(`❌ Failed to update note: ${improveNoteAction.filename}`);
                    actionContainer.createEl('span', { text: ' (Update failed)', cls: 'ai-chat-action-cancel' });
                }
            };
            noBtn.onclick = () => {
                yesBtn.disabled = true;
                noBtn.disabled = true;
                actionContainer.createEl('span', { text: ' (No changes made)', cls: 'ai-chat-action-cancel' });
            };
        }

        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    private async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || this.isLoading) return;

        // Add user message to history
        this.conversationHistory.push({ role: 'user', content: message });
        // Add user message to UI
        this.addMessage('user', message);
        this.messageInput.value = '';
        this.isLoading = true;
        this.sendButton.disabled = true;
        this.sendButton.textContent = 'Thinking...';

        try {
            // Get all notes content for context
            const allFiles = this.app.vault.getMarkdownFiles();
            const notesContext = await this.getNotesContext(allFiles, message);
            
            // Send to OpenAI with conversation history
            const response = await this.sendToOpenAI(message, notesContext);
            if (response) {
                // Add assistant message to history
                this.conversationHistory.push({ role: 'assistant', content: response });
                this.addMessage('assistant', response);
            }
        } catch (error) {
            console.error('AI Chat error:', error);
            this.addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
        } finally {
            this.isLoading = false;
            this.sendButton.disabled = false;
            this.sendButton.textContent = 'Send';
        }
    }

    private async getNotesContext(files: TFile[], query: string): Promise<string> {
        // Get all notes that might be relevant to the query
        const relevantFiles = files.filter(file => {
            const queryLower = query.toLowerCase();
            const filenameLower = file.basename.toLowerCase();
            const pathLower = file.path.toLowerCase();
            
            // Check if query matches filename or path
            return filenameLower.includes(queryLower) || 
                   pathLower.includes(queryLower) ||
                   queryLower.includes(filenameLower);
        });

        // Also search for notes containing the query text
        const contentMatches: TFile[] = [];
        for (const file of files.slice(0, 50)) { // Search first 50 files for content
            try {
                const content = await this.app.vault.read(file);
                if (content.toLowerCase().includes(query.toLowerCase())) {
                    contentMatches.push(file);
                }
            } catch (error) {
                // Skip files that can't be read
            }
        }

        // Combine and deduplicate
        const allRelevantFiles = [...new Set([...relevantFiles, ...contentMatches])];

        // If no specific matches, get recent files
        const filesToCheck = allRelevantFiles.length > 0 ? allRelevantFiles : 
            files.sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 15);

        let context = `You have access to ${files.length} notes in this Obsidian vault.\n\n`;
        
        if (allRelevantFiles.length > 0) {
            context += `Found ${allRelevantFiles.length} potentially relevant notes:\n`;
        } else {
            context += `Recent notes:\n`;
        }

        for (const file of filesToCheck) {
            try {
                const content = await this.app.vault.read(file);
                // Include full content for relevant files, longer preview for others
                const maxLength = allRelevantFiles.includes(file) ? 1000 : 500;
                const preview = content.length > maxLength ? 
                    content.substring(0, maxLength) + '...' : content;
                
                context += `\n--- ${file.basename} (${file.path}) ---\n${preview}\n`;
            } catch (error) {
                console.error(`Error reading file ${file.path}:`, error);
            }
        }

        return context;
    }

    private async sendToOpenAI(message: string, notesContext: string): Promise<string> {
        // Use last 10 exchanges for context
        const history = this.conversationHistory.slice(-10);
        const openaiMessages = [
            {
                role: 'system',
                content: `You are an AI assistant that helps users interact with their Obsidian notes. You can see all their notes and help them organize, search, and analyze their content. 

IMPORTANT GUIDELINES:
1. Be thorough and detailed in your responses. Don't just give brief summaries.
2. When asked about specific notes, search through ALL the provided context carefully.
3. If you find relevant information, include it in your response, even if it wasn't explicitly asked for.
4. When referencing notes, use the exact note names and file paths provided.
5. If you can't find something, suggest what might be a similar note or ask for clarification.

IMPORTANT: When the user asks you to create a note or task list, you should respond with a special format that includes the action to take. Use this format:

CREATE_NOTE: [filename]\n[content]

For example:
- If they ask for a task list, respond with: CREATE_NOTE: Task List\n- [content of the task list]
- If they ask for a new note, respond with: CREATE_NOTE: Note Title\n- [content of the note]

The system will automatically create the actual note file in Obsidian when it sees this format.

IMPORTANT: When the user asks you to improve, reformat, or rewrite an existing note, respond with this format:

IMPROVE_NOTE: [filename]\n[improved content]

Do NOT update the note directly. The system will show the user a draft and ask for approval before updating the note.`
            },
            ...history,
            {
                role: 'user',
                content: `Here is the context of the user's Obsidian notes:\n\n${notesContext}\n\nUser question: ${message}`
            }
        ];
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.plugin.settings.openaiApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.plugin.settings.chatModel,
                messages: openaiMessages,
                max_tokens: 1000,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        const responseText = data.choices[0].message.content;
        
        // Always log the full AI response for debugging
        console.log('AI raw response:', responseText);
        
        // Robust CREATE_NOTE parsing
        if (responseText.trim().toUpperCase().startsWith('CREATE_NOTE:')) {
            // Try to extract filename and content
            const match = responseText.match(/CREATE_NOTE:\s*([\w\- .\/]+)\n([\s\S]*)/i);
            if (match) {
                const filename = match[1].trim();
                const noteContent = match[2].trim();
                await this.plugin.createOrUpdateNote(filename, noteContent);
                return `✅ I've created the note "${filename}" in your vault!\n\n${noteContent}`;
            } else {
                // Log the raw response for debugging
                console.warn('CREATE_NOTE: format not matched. Raw response:', responseText);
                // Show a warning in the chat
                this.addMessage('assistant', `⚠️ I tried to create a note, but the format was not recognized. Please copy this text and share it with your developer:\n\n${responseText}`);
                return '';
            }
        }
        // Check if the response contains an IMPROVE_NOTE command
        if (responseText.startsWith('IMPROVE_NOTE:')) {
            const lines = responseText.split('\n');
            const commandLine = lines[0];
            const improvedContent = lines.slice(1).join('\n');
            const match = commandLine.match(/IMPROVE_NOTE:\s*(.+)/);
            if (match) {
                const filename = match[1].trim();
                // Show the improved draft in chat with Yes/No buttons
                this.addMessage('assistant', improvedContent, { filename, improvedContent });
                return '';
            }
        }
        
        return responseText;
    }

    async onClose() {
        // Cleanup if needed
    }
}

export default class AIAssistantPlugin extends Plugin {
    settings: AIAssistantSettings;
    private mediaRecorder: MediaRecorder | null = null;
    private audioChunks: Blob[] = [];
    private isRecording = false;

    async onload() {
        await this.loadSettings();

        // Register the AI Chat view
        this.registerView(
            'ai-chat-view',
            (leaf) => new AIChatView(leaf, this)
        );

        // Add ribbon icon for voice recording
        this.addRibbonIcon('microphone', 'Voice Dictation', (evt: MouseEvent) => {
            this.toggleVoiceRecording();
        });

        // Add AI Chat ribbon icon
        this.addRibbonIcon('message-circle', 'AI Note Assistant', (evt: MouseEvent) => {
            this.activateView();
        });

        // Add commands
        this.addCommand({
            id: 'voice-dictation',
            name: 'Start/Stop Voice Dictation',
            callback: () => this.toggleVoiceRecording()
        });

        this.addCommand({
            id: 'ai-chat',
            name: 'Open AI Note Assistant',
            callback: () => {
                this.activateView();
            }
        });

        this.addCommand({
            id: 'ai-tag-note',
            name: 'AI Tag Current Note',
            editorCallback: (editor: Editor, ctx: MarkdownView | any) => {
                if (ctx instanceof MarkdownView) {
                    this.aiTagCurrentNote(editor, ctx);
                }
            }
        });

        this.addCommand({
            id: 'extract-calendar',
            name: 'Extract Calendar Items',
            editorCallback: (editor: Editor, ctx: MarkdownView | any) => {
                if (ctx instanceof MarkdownView) {
                    this.extractCalendarItems(editor, ctx);
                }
            }
        });

        this.addCommand({
            id: 'generate-tasks',
            name: 'Generate Daily Tasks',
            editorCallback: (editor: Editor, ctx: MarkdownView | any) => {
                if (ctx instanceof MarkdownView) {
                    this.generateDailyTasks(editor, ctx);
                }
            }
        });

        this.addCommand({
            id: 'ai-backlink-suggestions',
            name: 'AI Backlink Suggestions',
            editorCallback: (editor: Editor, ctx: MarkdownView | any) => {
                if (ctx instanceof MarkdownView) {
                    this.suggestBacklinks(editor, ctx);
                }
            }
        });

        // Add settings tab
        this.addSettingTab(new AIAssistantSettingTab(this.app, this));

        // Add status bar
        this.addStatusBarItem().setText('AI Assistant Ready');

        console.log('AI Assistant Plugin loaded');
    }

    private async activateView() {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType('ai-chat-view')[0];

        if (!leaf) {
            // Create a new leaf in the right sidebar
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                leaf = rightLeaf;
                await leaf.setViewState({
                    type: 'ai-chat-view',
                    active: true,
                });
            }
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async toggleVoiceRecording() {
        if (!this.settings.openaiApiKey) {
            new Notice('Please set your OpenAI API key in settings first');
            return;
        }

        if (!this.isRecording) {
            await this.startRecording();
        } else {
            this.stopRecording();
        }
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                await this.transcribeAudio(audioBlob);
                
                // Clean up
                stream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            new Notice('🎤 Recording started... Click again to stop');
            
        } catch (error) {
            new Notice('Could not access microphone');
            console.error('Recording error:', error);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            new Notice('🎤 Recording stopped, processing...');
        }
    }

    async transcribeAudio(audioBlob: Blob) {
        try {
            const formData = new FormData();
            formData.append('file', audioBlob, 'recording.wav');
            formData.append('model', 'whisper-1');

            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.settings.openaiApiKey}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.text) {
                // Insert transcription into current note
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView) {
                    const editor = activeView.editor;
                    const cursor = editor.getCursor();
                    editor.replaceRange(data.text, cursor);
                    new Notice('✅ Transcription added to note');
                    
                    // Auto-process if enabled
                    if (this.settings.autoTagEnabled) {
                        await this.aiTagCurrentNote(editor, activeView);
                    }
                } else {
                    new Notice('No active note found');
                }
            } else {
                new Notice('Transcription failed');
            }
        } catch (error) {
            new Notice('Error transcribing audio');
            console.error('Transcription error:', error);
        }
    }

    async aiTagCurrentNote(editor: Editor, view: MarkdownView) {
        if (!this.settings.openaiApiKey) {
            new Notice('Please set your OpenAI API key in settings');
            return;
        }

        const content = editor.getValue();
        if (!content.trim()) {
            new Notice('Note is empty');
            return;
        }

        try {
            new Notice('🤖 Generating AI tags...');
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.settings.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{
                        role: 'user',
                        content: `Analyze this note and suggest 3-5 relevant tags for organization. Return only the tags separated by commas, no explanations:\n\n${content}`
                    }],
                    max_tokens: 100
                })
            });

            const data = await response.json();
            
            if (data.choices && data.choices[0]) {
                const tags = data.choices[0].message.content
                    .split(',')
                    .map((tag: string) => tag.trim().toLowerCase())
                    .filter((tag: string) => tag.length > 0);
                
                // Add tags to the note
                const tagString = tags.map((tag: string) => `#${tag.replace(/\s+/g, '-')}`).join(' ');
                
                // Find existing tags or add to end
                const lines = content.split('\n');
                const tagLineIndex = lines.findIndex(line => line.includes('#'));
                
                if (tagLineIndex !== -1) {
                    lines[tagLineIndex] += ` ${tagString}`;
                } else {
                    lines.push('', `Tags: ${tagString}`);
                }
                
                editor.setValue(lines.join('\n'));
                new Notice(`✅ Added tags: ${tags.join(', ')}`);
            }
        } catch (error) {
            new Notice('Error generating tags');
            console.error('AI tagging error:', error);
        }
    }

    async extractCalendarItems(editor: Editor, view: MarkdownView) {
        const content = editor.getValue();
        if (!content.trim()) {
            new Notice('Note is empty');
            return;
        }

        // Extract dates and times using regex
        const datePatterns = [
            /(\d{1,2}\/\d{1,2}\/\d{4})/g,
            /(\d{1,2}-\d{1,2}-\d{4})/g,
            /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
            /(today|tomorrow|next week|next month)/gi,
            /(\d{1,2}:\d{2}\s?(AM|PM))/gi
        ];

        const calendarItems: string[] = [];
        const lines = content.split('\n');

        lines.forEach((line, index) => {
            datePatterns.forEach(pattern => {
                const matches = line.match(pattern);
                if (matches) {
                    matches.forEach(match => {
                        calendarItems.push(`- ${match}: ${line.trim()}`);
                    });
                }
            });
        });

        if (calendarItems.length > 0) {
            // Create or update calendar note
            const calendarNote = `# Calendar Items from ${view.file?.name || 'Current Note'}\n\n${calendarItems.join('\n')}\n\nExtracted on: ${moment().format('YYYY-MM-DD HH:mm')}`;
            
            await this.createOrUpdateNote('Calendar Items', calendarNote);
            new Notice(`✅ Found ${calendarItems.length} calendar items`);
        } else {
            new Notice('No calendar items found');
        }
    }

    async generateDailyTasks(editor: Editor, view: MarkdownView) {
        if (!this.settings.openaiApiKey) {
            new Notice('Please set your OpenAI API key in settings');
            return;
        }

        const content = editor.getValue();
        if (!content.trim()) {
            new Notice('Note is empty');
            return;
        }

        try {
            new Notice('🤖 Generating daily tasks...');
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.settings.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{
                        role: 'user',
                        content: `Extract actionable tasks from this note. Return only a bullet list of tasks, no explanations:\n\n${content}`
                    }],
                    max_tokens: 200
                })
            });

            const data = await response.json();
            
            if (data.choices && data.choices[0]) {
                const tasks = data.choices[0].message.content.trim();
                
                // Create daily tasks note
                const today = moment().format('YYYY-MM-DD');
                const tasksNote = `# Daily Tasks - ${today}\n\n${tasks}\n\nGenerated from: [[${view.file?.name || 'Current Note'}]]`;
                
                await this.createOrUpdateNote(`Daily Tasks ${today}`, tasksNote);
                new Notice('✅ Daily tasks generated');
            }
        } catch (error) {
            new Notice('Error generating tasks');
            console.error('Task generation error:', error);
        }
    }

    async suggestBacklinks(editor: Editor, view: MarkdownView) {
        if (!this.settings.openaiApiKey) {
            new Notice('Please set your OpenAI API key in settings');
            return;
        }

        const content = editor.getValue();
        if (!content.trim()) {
            new Notice('Note is empty');
            return;
        }

        try {
            new Notice('🤖 Finding backlink suggestions...');
            
            // Get all note names in vault
            const allFiles = this.app.vault.getMarkdownFiles();
            const noteNames = allFiles.map(file => file.basename);
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.settings.openaiApiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{
                        role: 'user',
                        content: `Based on this note content, suggest which of these existing notes would be good to link to. Return only the note names separated by commas:\n\nNote content: ${content}\n\nExisting notes: ${noteNames.join(', ')}`
                    }],
                    max_tokens: 150
                })
            });

            const data = await response.json();
            
            if (data.choices && data.choices[0]) {
                const suggestions = data.choices[0].message.content
                    .split(',')
                    .map((name: string) => name.trim())
                    .filter((name: string) => noteNames.includes(name));
                
                if (suggestions.length > 0) {
                    const backlinks = suggestions.map((name: string) => `[[${name}]]`).join(' ');
                    
                    // Add backlinks section
                    const newContent = `${content}\n\n## Related Notes\n${backlinks}`;
                    editor.setValue(newContent);
                    
                    new Notice(`✅ Added ${suggestions.length} backlink suggestions`);
                } else {
                    new Notice('No relevant backlinks found');
                }
            }
        } catch (error) {
            new Notice('Error finding backlinks');
            console.error('Backlink suggestion error:', error);
        }
    }

    async createOrUpdateNote(title: string, content: string) {
        const folder = this.settings.dailyNotesFolder;
        const rawTitle = title;
        title = title.trim();
        // Remove .md if present, then add it back once
        let base = title.replace(/\.md$/i, '');
        const filename = `${base}.md`;
        const allFiles = this.app.vault.getMarkdownFiles();
        let existingFile: TFile | undefined;

        // Log the raw title for debugging
        console.log('AI requested note update for title:', rawTitle, '| normalized filename:', filename);

        // 1. Prefer the currently active note if its basename matches (ignoring extension)
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file) {
            const activeFile = activeView.file;
            if (
                activeFile.basename.toLowerCase() === base.toLowerCase() ||
                activeFile.name.toLowerCase() === filename.toLowerCase()
            ) {
                existingFile = activeFile;
            }
        }

        // 2. If not, search for the file by basename (case-insensitive)
        if (!existingFile) {
            existingFile = allFiles.find(f => f.basename.toLowerCase() === base.toLowerCase());
        }
        if (!existingFile) {
            // Try with .md extension
            existingFile = allFiles.find(f => f.name.toLowerCase() === filename.toLowerCase());
        }
        try {
            if (existingFile) {
                console.log('Updating note:', existingFile.path);
                await this.app.vault.modify(existingFile, content);
                new Notice(`Updated note: ${existingFile.path}`);
            } else {
                // Create new file in the daily notes folder (or root if not set)
                const filepath = folder ? `${folder}/${filename}` : filename;
                await this.app.vault.create(filepath, content);
                new Notice(`Created new note: ${filepath}`);
            }
        } catch (error) {
            console.error('Error creating/updating note:', error);
            new Notice('Error creating or updating note');
        }
    }

    onunload() {
        if (this.isRecording) {
            this.stopRecording();
        }
    }
}

// Settings tab
class AIAssistantSettingTab extends PluginSettingTab {
    plugin: AIAssistantPlugin;

    constructor(app: App, plugin: AIAssistantPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'AI Assistant Settings'});

        new Setting(containerEl)
            .setName('OpenAI API Key')
            .setDesc('Enter your OpenAI API key for AI features')
            .addText(text => text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.openaiApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-tag after dictation')
            .setDesc('Automatically generate tags after voice dictation')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoTagEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.autoTagEnabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Daily Notes Folder')
            .setDesc('Folder to store generated daily notes and tasks')
            .addText(text => text
                .setPlaceholder('Daily Notes')
                .setValue(this.plugin.settings.dailyNotesFolder)
                .onChange(async (value) => {
                    this.plugin.settings.dailyNotesFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('AI Chat Model')
            .setDesc('OpenAI model to use for AI chat interactions')
            .addDropdown(dropdown => dropdown
                .addOption('gpt-4', 'GPT-4 (Recommended)')
                .addOption('gpt-3.5-turbo', 'GPT-3.5 Turbo (Faster)')
                .setValue(this.plugin.settings.chatModel)
                .onChange(async (value) => {
                    this.plugin.settings.chatModel = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', {text: 'Usage Instructions'});
        
        const instructions = containerEl.createEl('div');
        instructions.innerHTML = `
            <p><strong>Voice Dictation:</strong> Click the microphone icon or use the command palette</p>
            <p><strong>AI Note Assistant:</strong> Click the message icon or use command palette to chat with AI about your notes</p>
            <p><strong>AI Features:</strong> Use command palette (Cmd+P) to access:</p>
            <ul>
                <li>Open AI Note Assistant</li>
                <li>AI Tag Current Note</li>
                <li>Extract Calendar Items</li>
                <li>Generate Daily Tasks</li>
                <li>AI Backlink Suggestions</li>
            </ul>
            <p><strong>AI Chat Examples:</strong></p>
            <ul>
                <li>"Summarize my recent notes about project X"</li>
                <li>"Find all notes related to meetings"</li>
                <li>"What are the main topics I write about?"</li>
                <li>"Organize my notes by priority"</li>
            </ul>
        `;
    }
} 