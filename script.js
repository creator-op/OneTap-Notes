document.addEventListener('DOMContentLoaded', () => {
    // PWA Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(registration => {
                    console.log('[SW] Service Worker registered with scope:', registration.scope);
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                console.log('[SW] New content is available, please refresh.');
                                // Optionally, show a "new version available" toast
                            }
                        });
                    });
                })
                .catch(error => console.error('[SW] Service Worker registration failed:', error));
        });
    }

    // PWA Install Prompt Handling
    let deferredInstallPrompt = null;
    const installAppButton = document.getElementById('install-app-button');

    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('[PWA] beforeinstallprompt event fired');
        e.preventDefault(); // Prevent the mini-infobar from appearing on mobile
        deferredInstallPrompt = e; // Stash the event
        if (installAppButton) installAppButton.style.display = 'flex'; // Show our custom install button
        console.log('[PWA] Installation prompt stashed.');
    });

    if (installAppButton) {
        installAppButton.addEventListener('click', async () => {
            if (deferredInstallPrompt) {
                deferredInstallPrompt.prompt(); // Show the install prompt
                const { outcome } = await deferredInstallPrompt.userChoice;
                console.log(`[PWA] User response to the install prompt: ${outcome}`);
                if (outcome === 'accepted') {
                    console.log('[PWA] User accepted the A2HS prompt');
                } else {
                    console.log('[PWA] User dismissed the A2HS prompt');
                }
                deferredInstallPrompt = null; // We can only use it once.
                installAppButton.style.display = 'none'; // Hide button after use
            }
        });
    }
     // Check if the app is already installed (running in standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
        console.log('[PWA] App is running in standalone mode.');
        if (installAppButton) installAppButton.style.display = 'none'; // Hide install button if already installed
    }


    // DOM Elements
    const noteInput = document.getElementById('note-input');
    const previousNotesSection = document.getElementById('previous-notes-section');
    const noNotesMessage = document.getElementById('no-notes-message');
    const backButton = document.querySelector('.back-button');
    const appTitleText = document.querySelector('.app-title-text');
    const mainNoteTimeEl = document.getElementById('main-note-time');
    const mainNoteDayEl = document.getElementById('main-note-day');
    const mainNoteDateEl = document.getElementById('main-note-date');
    const editSaveButton = document.getElementById('edit-save-button');
    const themeToggleButton = document.getElementById('theme-toggle-button');
    const themeIconSun = document.getElementById('theme-icon-sun');
    const themeIconMoon = document.getElementById('theme-icon-moon');
    const deleteSelectedButton = document.getElementById('delete-selected-button');
    const confirmationModal = document.getElementById('confirmation-modal');
    const modalMessage = document.getElementById('modal-message');
    const confirmDeleteButton = document.getElementById('confirm-delete-button');
    const cancelDeleteButton = document.getElementById('cancel-delete-button');

    const NOTES_STORAGE_KEY = 'oneTapNotes_v2'; // Changed key if data structure changes
    const THEME_STORAGE_KEY = 'oneTapTheme_v2';
    let currentEditingNoteId = null;
    let isMainNoteInEditMode = true; // true if new note or editing past note, false if viewing past note
    let isSelectionMode = false;
    let selectedNoteIds = new Set();

    function formatDate(timestamp) {
        const dateObj = new Date(timestamp);
        return {
            time: dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false }),
            day: dateObj.toLocaleDateString([], { weekday: 'long' }),
            date: dateObj.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }),
            shortDate: dateObj.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
        };
    }

    function applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_STORAGE_KEY, theme);
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (theme === 'dark') {
            themeIconSun.style.display = 'none';
            themeIconMoon.style.display = 'block';
            if (themeColorMeta) themeColorMeta.setAttribute('content', '#2b2b2b'); // Dark card color
        } else {
            themeIconSun.style.display = 'block';
            themeIconMoon.style.display = 'none';
            if (themeColorMeta) themeColorMeta.setAttribute('content', '#FDFBF3'); // Light card color
        }
    }

    function toggleTheme() {
        applyTheme(document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    }

    function getNotes() { return JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY)) || []; }
    function saveNotes(notes) { localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes)); }

    function updateMainNoteDateTimeDisplay(timestamp) {
        const { time, day, date } = formatDate(timestamp);
        mainNoteTimeEl.textContent = time;
        mainNoteDayEl.textContent = day;
        mainNoteDateEl.textContent = date;
    }

    function displayCurrentDateTimeForNewNote() { updateMainNoteDateTimeDisplay(Date.now()); }

    function renderNotes() {
        const notes = getNotes().sort((a, b) => b.timestamp - a.timestamp);
        previousNotesSection.innerHTML = '';
        if (notes.length > 0) {
            previousNotesSection.style.display = 'flex';
            noNotesMessage.style.display = 'none';
            notes.forEach(createNotePreviewCard);
        } else {
            previousNotesSection.style.display = 'none';
            noNotesMessage.style.display = 'block';
        }
        updateHeaderForSelectionMode();
    }

    function createNotePreviewCard(note) {
        const noteCard = document.createElement('div');
        noteCard.className = 'note-preview-card';
        noteCard.setAttribute('data-id', String(note.id));
        if (isSelectionMode) noteCard.classList.add('selection-mode');
        if (selectedNoteIds.has(note.id)) noteCard.classList.add('selected');

        const { shortDate } = formatDate(note.timestamp);
        noteCard.innerHTML = `
            <span class="preview-date">${shortDate}</span>
            <p class="preview-text">${(note.content || "").split('\n')[0] || "Empty Note"}</p>
        `;

        let pressTimer;
        noteCard.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 || e.target.closest('button')) return;
            pressTimer = setTimeout(() => {
                if (!isSelectionMode) {
                    isSelectionMode = true;
                    renderNotes(); // Re-render all to show selection mode cues
                }
                toggleNoteSelection(note.id);
            }, 500);
        });
        const clearPressTimer = () => clearTimeout(pressTimer);
        noteCard.addEventListener('pointerup', clearPressTimer);
        noteCard.addEventListener('pointerleave', clearPressTimer); // Clear if pointer leaves
        noteCard.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            clearTimeout(pressTimer); // Important to prevent long press if it's a quick click
            if (isSelectionMode) {
                toggleNoteSelection(note.id);
            } else {
                loadNoteIntoMainView(note.id);
            }
        });
        previousNotesSection.appendChild(noteCard);
    }
    function saveCurrentNoteContent(forceSave = false) {
        const content = noteInput.value;
        const notes = getNotes();
        const now = Date.now();

        if (currentEditingNoteId) {
            const noteIndex = notes.findIndex(n => n.id === currentEditingNoteId);
            if (noteIndex > -1) {
                if (content.trim() || forceSave) { // Save even if empty if forceSave is true (e.g. for new note that user clears)
                    notes[noteIndex].content = content; // Save potentially empty content
                    notes[noteIndex].timestamp = now;
                    if (!content.trim() && !forceSave) { // If content became empty and not force saving, effectively delete
                         notes.splice(noteIndex, 1);
                         currentEditingNoteId = null; // No longer editing this
                    }
                } else if (!forceSave) { // Content empty and not forcing save, delete it
                    notes.splice(noteIndex, 1);
                    currentEditingNoteId = null;
                }
            } else if (content.trim()) { // currentEditingNoteId was set, but note disappeared (e.g. from another tab), save as new
                const newNote = { id: currentEditingNoteId, content, timestamp: now };
                notes.push(newNote);
            }
        } else if (content.trim()) { // Creating a brand new note
            const newNote = { id: now, content, timestamp: now };
            notes.push(newNote);
            currentEditingNoteId = newNote.id;
        }
        saveNotes(notes);
    }


    noteInput.addEventListener('input', () => {
        if (isMainNoteInEditMode) {
            saveCurrentNoteContent();
        }
    });
    noteInput.addEventListener('blur', () => {
        if (isMainNoteInEditMode) {
            saveCurrentNoteContent(true); // Force save on blur to capture empty states correctly
        }
        renderNotes();
    });

    function loadNoteIntoMainView(noteId) {
        saveCurrentNoteContent(true); // Save current state before loading another
        const notes = getNotes();
        const noteToView = notes.find(note => note.id === noteId);
        if (noteToView) {
            currentEditingNoteId = noteToView.id;
            noteInput.value = noteToView.content;
            updateMainNoteDateTimeDisplay(noteToView.timestamp);
            noteInput.readOnly = true;
            isMainNoteInEditMode = false;
            editSaveButton.textContent = 'Edit';
            editSaveButton.style.display = 'block';
            noteInput.focus(); // Focus even in read-only mode
            if (isSelectionMode) exitSelectionMode();
        }
    }

    function resetToNewNoteState(isBackButtonPress = false) {
        // Point 1: Back button exit logic
        if (isBackButtonPress && !currentEditingNoteId && !noteInput.value.trim() && getNotes().length === 0) {
            console.log("[App Exit] Conditions met. PWA should handle exit via OS back button.");
            // For web, we can't programmatically close the tab.
            // If running as PWA, the OS back button on Android might close/minimize.
            // On desktop PWA, it might not do anything or go to previous page if there was one.
            // This function will still reset the UI state.
            // return; // Don't return here, let it reset the UI.
        }

        if (currentEditingNoteId || noteInput.value.trim()) { // Only save if there's something to save or an ID
            saveCurrentNoteContent(true); // Force save to capture empty state of an existing note
        }

        currentEditingNoteId = null;
        noteInput.value = '';
        noteInput.readOnly = false;
        isMainNoteInEditMode = true;
        editSaveButton.style.display = 'none';
        displayCurrentDateTimeForNewNote();
        // Point 3: Keyboard on open/reset
        setTimeout(() => noteInput.focus(), 0); // Timeout helps ensure focus on some mobile browsers
        if (isSelectionMode) exitSelectionMode();
        renderNotes();
    }

    function toggleNoteSelection(noteId) {
        const noteCard = document.querySelector(`.note-preview-card[data-id="${String(noteId)}"]`);
        if (selectedNoteIds.has(noteId)) {
            selectedNoteIds.delete(noteId);
            noteCard?.classList.remove('selected');
        } else {
            selectedNoteIds.add(noteId);
            noteCard?.classList.add('selected');
        }
        updateHeaderForSelectionMode();
        if (selectedNoteIds.size === 0 && isSelectionMode) exitSelectionMode(false); // Don't reset to new note
    }

    function updateHeaderForSelectionMode() {
        const installButtonVisible = installAppButton && installAppButton.style.display !== 'none';
        if (isSelectionMode && selectedNoteIds.size > 0) {
            appTitleText.textContent = `${selectedNoteIds.size} selected`;
            deleteSelectedButton.style.display = 'flex';
            themeToggleButton.style.display = 'none';
            if(installAppButton) installAppButton.style.display = 'none';
        } else {
            appTitleText.textContent = 'OneTap Notes';
            deleteSelectedButton.style.display = 'none';
            themeToggleButton.style.display = 'flex';
            if(installAppButton && deferredInstallPrompt && !window.matchMedia('(display-mode: standalone)').matches && !window.navigator.standalone) {
                installAppButton.style.display = 'flex';
            } else if (installAppButton) {
                 installAppButton.style.display = 'none';
            }
        }
    }

    function exitSelectionMode(resetView = true) {
        isSelectionMode = false;
        selectedNoteIds.clear();
        document.querySelectorAll('.note-preview-card.selection-mode, .note-preview-card.selected').forEach(card => {
            card.classList.remove('selection-mode');
            card.classList.remove('selected');
        });
        updateHeaderForSelectionMode();
        if(resetView) renderNotes(); // Re-render if view needs full reset
    }

    function showConfirmationModal(count) {
        modalMessage.textContent = `Delete ${count} note${count > 1 ? 's' : ''}?`;
        confirmationModal.style.display = 'flex';
    }
    function hideConfirmationModal() { confirmationModal.style.display = 'none'; }

    function deleteSelectedNotes() {
        if (selectedNoteIds.size === 0) return;
        let notes = getNotes();
        const currentNoteWasAmongDeleted = currentEditingNoteId && selectedNoteIds.has(currentEditingNoteId);
        notes = notes.filter(note => !selectedNoteIds.has(note.id));
        saveNotes(notes);
        hideConfirmationModal();
        const shouldResetView = currentNoteWasAmongDeleted;
        exitSelectionMode(false); // Exit selection mode first without full render
        renderNotes(); // Now render after notes are deleted
        if (shouldResetView) {
            resetToNewNoteState(false);
        }
    }

    backButton.addEventListener('click', () => {
        if (isSelectionMode) {
            exitSelectionMode(true);
        } else {
            resetToNewNoteState(true); // Pass true to indicate it's a back button press for exit logic
        }
    });

    editSaveButton.addEventListener('click', () => {
        if (noteInput.readOnly) { // Current state: Viewing past note
            noteInput.readOnly = false;
            isMainNoteInEditMode = true;
            editSaveButton.textContent = 'Save';
            noteInput.focus();
            displayCurrentDateTimeForNewNote(); // Show current time as edit starts
        } else { // Current state: Editing past note (or new note if button was somehow visible)
            saveCurrentNoteContent(true); // Force save, including empty if user cleared it
            const wasEditingExistingNote = !!currentEditingNoteId;

            if (wasEditingExistingNote && noteInput.value.trim() === "") { // If an existing note was cleared
                resetToNewNoteState(false); // This will have deleted the note if saveCurrentNoteContent allows
            } else if (wasEditingExistingNote) {
                noteInput.readOnly = true;
                isMainNoteInEditMode = false;
                editSaveButton.textContent = 'Edit';
                 // update its timestamp display after save
                const updatedNote = getNotes().find(n => n.id === currentEditingNoteId);
                if (updatedNote) updateMainNoteDateTimeDisplay(updatedNote.timestamp);
            } else { // Was editing a new note and pressed save (though this button isn't usually for new notes)
                 resetToNewNoteState(false);
            }
            renderNotes();
        }
    });

    themeToggleButton.addEventListener('click', toggleTheme);
    deleteSelectedButton.addEventListener('click', () => { if (selectedNoteIds.size > 0) showConfirmationModal(selectedNoteIds.size); });
    confirmDeleteButton.addEventListener('click', deleteSelectedNotes);
    cancelDeleteButton.addEventListener('click', hideConfirmationModal);

    // Initial Setup
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
    applyTheme(savedTheme);
    resetToNewNoteState(false); // Initial load, don't try to exit
    renderNotes();
    setInterval(() => { // Update live time if on new note screen or actively editing
        if (isMainNoteInEditMode) displayCurrentDateTimeForNewNote();
    }, 30000);
});