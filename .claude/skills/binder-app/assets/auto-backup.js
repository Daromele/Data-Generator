/* Automatic backup to a file the owner chooses (File System Access API).
 * Chrome, Edge and Opera on a computer support it; Safari and Firefox do
 * not and must fall back to the manual download. Permission is dropped
 * when the browser restarts, so the app re-asks with a single click.
 */

            // ---- Linked backup file --------------------------------------
async initBackupLink() {
                this.backupLink = { status: backupFile.supported ? 'off' : 'unsupported', name: '', lastWrite: null, error: '' };
                if (!backupFile.supported) return this.refreshBackupUI();

                const handle = await backupFile.restore();
                if (!handle) return this.refreshBackupUI();

                this.backupLink.name = handle.name || 'backup.json';
                this.backupLink.lastWrite = parseInt(storage.get('evBackupLinkWritten') || '0', 10) || null;
                // Browsers drop the grant between sessions; one click restores it.
                const state = await backupFile.permission();
                this.backupLink.status = state === 'granted' ? 'linked' : 'needs-permission';
                this.refreshBackupUI();
                if (state === 'granted') this.writeBackupFile();
                else setTimeout(() => this.openBackupPrompt(), 600);
            }

async chooseBackupFile() {
                if (!backupFile.supported) return;
                const stamp = new Date().toISOString().split('T')[0];
                try {
                    const handle = await backupFile.link(`Family_Binder_Backup_${stamp}.json`);
                    this.backupLink.status = 'linked';
                    this.backupLink.name = handle.name || 'backup.json';
                    this.backupLink.error = '';
                    await this.writeBackupFile({ announce: true });
                    this.requestPersistentStorage();
                } catch (err) {
                    if (err && err.name === 'AbortError') return; // picker dismissed
                    this.backupLink.status = 'error';
                    this.backupLink.error = 'That file could not be used for backups.';
                    this.showToast('That file could not be used for backups.', 'error');
                }
                this.refreshBackupUI();
            }

async reconnectBackupFile() {
                const state = await backupFile.permission({ request: true });
                if (state === 'granted') {
                    this.backupLink.status = 'linked';
                    await this.writeBackupFile({ announce: true });
                } else {
                    this.showToast('Backup file access was not granted.', 'error');
                }
                this.refreshBackupUI();
            }

async stopBackupLink() {
                await backupFile.unlink();
                storage.remove('evBackupLinkWritten');
                this.backupLink = { status: 'off', name: '', lastWrite: null, error: '' };
                this.showToast('Automatic backup switched off.');
                this.refreshBackupUI();
            }

async writeBackupFile({ announce = false } = {}) {
                if (!this.backupLink || this.backupLink.status !== 'linked') return false;
                try {
                    await backupFile.write(await this.backupPayload());
                    const now = Date.now();
                    this.backupLink.lastWrite = now;
                    this.backupLink.error = '';
                    storage.set('evBackupLinkWritten', String(now));
                    storage.set('evLastBackup', String(now));
                    if (announce) this.showToast(`Backing up to ${this.backupLink.name}`);
                    this.refreshBackupUI();
                    return true;
                } catch (err) {
                    // The file was moved, deleted, or the grant was revoked.
                    this.backupLink.status = 'needs-permission';
                    this.backupLink.error = 'Could not write to the backup file.';
                    if (!this.backupWarned) {
                        this.backupWarned = true;
                        this.showToast('Automatic backup could not write to its file.', 'error');
                        setTimeout(() => this.openBackupPrompt(), 400);
                    }
                    this.refreshBackupUI();
                    return false;
                }
            }

            // Records save constantly; the file only needs the settled result.
scheduleBackupWrite() {
                if (!this.backupLink || this.backupLink.status !== 'linked') return;
                clearTimeout(this.backupTimer);
                this.backupTimer = setTimeout(() => this.writeBackupFile(), 2000);
            }

backupStatusLine() {
                const link = this.backupLink || { status: 'off' };
                if (link.status === 'linked') {
                    const when = link.lastWrite ? new Date(link.lastWrite) : null;
                    const forgets = backupFile.remembered === false ? ' &middot; this browser will ask you to pick the file again next time' : '';
                    return `Saving to ${escapeHtml(link.name)}${when ? ` &middot; last written ${escapeHtml(when.toLocaleString())}` : ''}${forgets}`;
                }
                if (link.status === 'needs-permission') return `${escapeHtml(link.name || 'Backup file')} needs reconnecting after restarting your browser.`;
                if (link.status === 'unsupported') return 'This browser cannot link a backup file. Chrome, Edge or Opera on a computer can.';
                if (link.status === 'error') return escapeHtml(link.error || 'Backup file unavailable.');
                return 'No backup file linked yet.';
            }

refreshBackupUI() {
                if (this.currentSection === 'settings') this.renderSettings();
                else if (this.currentSection === 'dashboard') this.renderDashboard();
            }

daysSinceBackup() {
                const last = storage.get('evLastBackup');
                if (!last) return null;
                return Math.floor((Date.now() - parseInt(last, 10)) / 86400000);
            }

            // Ask the browser not to evict this origin's storage under pressure.
requestPersistentStorage() {
                if (navigator.storage && navigator.storage.persist) {
                    navigator.storage.persist().catch(() => {});
                }
            }
