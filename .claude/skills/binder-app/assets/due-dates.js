/* Due-date machinery: buckets, badges, and rolling a recurring task on.
 *
 * The trap this exists to solve: `null >= 0` is TRUE in JavaScript, so an
 * undated record silently matched "due this week", "due this month" and
 * "due in 90 days" all at once. Every bucket test goes through
 * matchesDueBucket, which handles the undated case explicitly.
 */

const DUE_BUCKETS = [
            { id: 'attention', label: 'Needs attention', test: d => d <= 30 },
            { id: 'overdue', label: 'Overdue', test: d => d < 0 },
            { id: 'today', label: 'Due today', test: d => d === 0 },
            { id: 'week', label: 'Due this week', test: d => d >= 0 && d <= 7 },
            { id: 'month', label: 'Due this month', test: d => d >= 0 && d <= 30 },
            { id: 'quarter', label: 'Due in 90 days', test: d => d >= 0 && d <= 90 },
            { id: 'later', label: 'Not due yet', test: d => d > 90 },
            { id: 'undated', label: 'No date set', test: d => d === null }
        ];

            // The nearest deadline on a record, and how to say it in one phrase.
            // Returns null for sections that have no deadline at all, so callers
            // can use it as the test for whether any of this applies.
dueStatus(item, sectionKey) {
                const cfg = SECTIONS[sectionKey];
                const fields = (cfg && cfg.dueFields) || [];
                if (fields.length === 0) return null;

                let soonest = null;
                fields.forEach(name => {
                    const days = daysUntil(item[name]);
                    if (days === null) return;
                    if (soonest === null || days < soonest.days) soonest = { days, field: name, date: item[name] };
                });
                if (!soonest) return { days: null, field: fields[0], date: '', bucket: 'undated', label: 'No date set', tone: 'none' };

                const d = soonest.days;
                const plural = n => `${n} day${n === 1 ? '' : 's'}`;
                let bucket, label, tone;
                if (d < 0) { bucket = 'overdue'; label = `${plural(-d)} overdue`; tone = 'rose'; }
                else if (d === 0) { bucket = 'today'; label = 'Due today'; tone = 'rose'; }
                else if (d <= 30) { bucket = 'soon'; label = `in ${plural(d)}`; tone = 'amber'; }
                else if (d <= 90) { bucket = 'quarter'; label = `in ${plural(d)}`; tone = 'slate'; }
                else { bucket = 'later'; label = `in ${plural(d)}`; tone = 'none'; }
                return Object.assign(soonest, { bucket, label, tone });
            }

matchesDueBucket(item, sectionKey, bucketId) {
                const bucket = DUE_BUCKETS.find(b => b.id === bucketId);
                if (!bucket) return true;
                const status = this.dueStatus(item, sectionKey);
                if (!status) return true;
                return inDueBucket(bucket, status.days);
            }

dueBadgeHtml(status) {
                if (!status || status.tone === 'none') return '';
                const tones = {
                    rose: 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800',
                    amber: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
                    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                };
                const icon = status.tone === 'rose' ? 'ph-warning-circle' : (status.tone === 'amber' ? 'ph-clock' : 'ph-calendar-check');
                return `<span class="ml-2 px-2 py-0.5 ${tones[status.tone]} rounded-md text-[10px] font-bold border inline-flex items-center gap-1 whitespace-nowrap align-middle"><i class="ph ${icon}"></i>${escapeHtml(status.label)}</span>`;
            }

            // How many records in a section are already past their date. Drives
            // the red count in the sidebar, so a lapsed policy is visible from
            // any page rather than only from the one you have to think to open.
overdueCount(sectionKey) {
                const cfg = SECTIONS[sectionKey];
                if (!cfg || !cfg.dueFields) return 0;
                return (this.data[sectionKey] || []).filter(i => {
                    const st = this.dueStatus(i, sectionKey);
                    return st && st.days !== null && st.days < 0;
                }).length;
            }

            // The one action a chore list needs and almost none of them have: I
            // did it today, work out when it is next due. Doing this by hand
            // means editing two fields and counting on a calendar, which is
            // exactly why the log stops being kept.
markDone(sectionKey, itemId) {
                const list = this.data[sectionKey] || [];
                const item = list.find(i => i.id === itemId);
                if (!item) return;

                const today = new Date();
                item.last_done = this.isoDate(today);

                // Write back to whichever field this section actually calls its
                // deadline -- 'due' here, 'next_due' elsewhere. Guessing one name
                // silently updated nothing.
                const config = SECTIONS[sectionKey] || {};
                const dueField = (config.dueFields && config.dueFields[0]) || config.dateField || 'due';
                const step = this.FREQUENCY_STEP[item.frequency];

                if (step) {
                    let next = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    if (step.months) next.setMonth(next.getMonth() + step.months);
                    if (step.days) next.setDate(next.getDate() + step.days);
                    if (step.weekdays) {
                        // Monday's bins are not due again on Saturday.
                        next.setDate(next.getDate() + 1);
                        while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
                    }
                    item[dueField] = this.isoDate(next);
                    this.showToast(`Done today. Next due ${formatDate(item[dueField])}.`, 'success');
                } else {
                    // "As needed" has no interval to roll forward, so say what was
                    // and was not changed rather than inventing a date.
                    this.showToast('Logged as done today. This task has no set interval, so the due date is unchanged.', 'info');
                }

                if (!this.saveData()) return;
                this.reRenderCurrentSection();
            }

            // Every dated obligation across the binder, in one list.
upcomingItems() {
                const sources = [
                    { key: 'protocol', field: 'review_due', label: i => i.task, kind: 'Action', icon: 'ph-clock-countdown' },
                    { key: 'documents', field: 'expires', label: i => i.item, kind: 'Document', icon: 'ph-folder-open' },
                    { key: 'insurance', field: 'renews', label: i => `${i.provider} — ${i.kind}`, kind: 'Policy', icon: 'ph-shield-check' },
                    { key: 'medical', field: 'reviewed', label: i => `Review ${this.memberName(i.member)}`, kind: 'Medical', icon: 'ph-first-aid-kit' },
                    { key: 'vehicles', field: 'next_due', label: i => `${i.vehicle} — MOT or service`, kind: 'Vehicle', icon: 'ph-car' }
                ];
                const out = [];
                sources.forEach(src => {
                    if (this.hiddenSections.includes(src.key)) return;
                    (this.data[src.key] || []).forEach(item => {
                        const days = daysUntil(item[src.field]);
                        if (days === null) return;
                        if (src.neverLate && days < 0) return;
                        if (String(item.status || '').includes('🟢') || String(item.status || '').includes('✅')) return;
                        if (!this.recordMatchesMember(item, this.dashboardMemberFilter)) return;
                        out.push({
                            section: src.key, kind: src.kind, icon: src.icon,
                            label: src.label(item) || SECTIONS[src.key].singular,
                            id: item.id, date: item[src.field], days
                        });
                    });
                });
                return out.sort((a, b) => a.days - b.days);
            }
