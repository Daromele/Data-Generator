/* The entity: the record type everything else hangs off -- students in the
 * homeschool planner, people in the vault, accounts in the finance planner.
 * The names differ per product (students()/members()); the shape does not,
 * so copy this and rename.
 *
 * It buys the two things that sell the product: one dropdown that narrows
 * the WHOLE app to a single person, and per-entity sections in documents.
 */

            // ---- Reference resolvers -------------------------------------
            // Records store room IDs, so renaming a room no longer
            // orphans every record filed against it.
members() {
                return (this.data.members || []).filter(room => room.name && String(room.name).trim() !== '');
            }

memberName(id) {
                if (!id) return '';
                const found = (this.data.members || []).find(room => room.id === id);
                return found ? found.name : id;
            }

memberNames(ids) {
                if (!ids) return '';
                const list = Array.isArray(ids) ? ids : [ids];
                return list.map(id => this.memberName(id)).filter(Boolean).join(', ');
            }

recordMatchesMember(item, roomId) {
                if (!roomId || roomId === 'all') return true;
                const val = item.member;
                if (val === undefined || val === null || val === '') return true;
                return Array.isArray(val) ? val.includes(roomId) : val === roomId;
            }

            // A print selection is either 'all' or a list of room ids.
printMemberIds(entity) {
                if (!entity || entity === 'all') return this.members().map(room => room.id);
                return (Array.isArray(entity) ? entity : [entity]).filter(Boolean);
            }

printMemberLabel(entity) {
                if (!entity || entity === 'all') return 'All Rooms';
                const names = this.printMemberIds(entity).map(id => this.memberName(id)).filter(Boolean);
                if (names.length === 0) return 'All Rooms';
                if (names.length <= 3) return names.join(', ');
                return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
            }

printMemberBoxes() {
                return [...document.querySelectorAll('#print-entity-list .print-entity')];
            }

            // Returns 'all' when every room is ticked, otherwise the ids.
selectedPrintMembers() {
                const boxes = this.printMemberBoxes();
                if (boxes.length === 0) return 'all';
                const chosen = boxes.filter(b => b.checked).map(b => b.value);
                if (chosen.length === 0) return null;
                return chosen.length === boxes.length ? 'all' : chosen;
            }

syncPrintMemberToggle() {
                const boxes = this.printMemberBoxes();
                const btn = document.getElementById('print-entity-toggle-all');
                if (!btn) return;
                btn.innerText = boxes.every(b => b.checked) ? 'Select none' : 'Select all';
            }

togglePrintMembers() {
                const boxes = this.printMemberBoxes();
                const selectAll = !boxes.every(b => b.checked);
                boxes.forEach(b => { b.checked = selectAll; });
                this.syncPrintMemberToggle();
            }
