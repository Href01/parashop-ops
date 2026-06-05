# Pre-Change Checklist

**MANDATORY:** Complete this checklist BEFORE making ANY code changes.

---

## Purpose

Prevent mistakes by UNDERSTANDING before ACTING.

---

## Step 1: Read Documentation (2 min)

**Before changing ANYTHING:**

- [ ] Read `docs/PROJECT_OVERVIEW.md` - Understand system architecture
- [ ] Read `docs/PREVENTION_SYSTEM.md` - Know validation layer
- [ ] Read `CLAUDE.md` - Follow project rules

**Why:** So I know what exists and how it works.

---

## Step 2: Search Existing Code (3 min)

**Before implementing a feature:**

```bash
# Search for existing implementation
grep -r "functionName" .
grep -r "similar feature" .
```

- [ ] Check if feature already exists
- [ ] Check if similar code exists (reuse, don't duplicate)
- [ ] Check if there's a utility function for this

**Why:** Prevent duplicate implementations.

---

## Step 3: Check Dependencies (2 min)

**Before changing a function/API:**

```bash
# Find all usages
grep -r "functionName" .
grep -r "apiEndpoint" .
```

- [ ] List all files that use this
- [ ] Understand impact of changes
- [ ] Plan how to update all usages

**Why:** Prevent breaking other parts of the system.

---

## Step 4: Verify External APIs (If Applicable)

**Before calling Sendit/other APIs:**

- [ ] Read `docs/PROJECT_OVERVIEW.md` → External Integrations section
- [ ] Check exact format required (phone, amount, etc.)
- [ ] Use validation utilities (`formatPhoneForSendit`, etc.)
- [ ] Check maximum limits (5000 DH for Sendit)

**Why:** Prevent 422 errors from external APIs.

---

## Step 5: Check Data Types (1 min)

**Before calculations or data transformation:**

- [ ] Ensure numbers are numbers (not strings)
- [ ] Use `lib/utils/numbers.ts` utilities
- [ ] Use Zod validation if from user input
- [ ] Never assume type - always validate

**Why:** Prevent string concatenation bugs (33019).

---

## Step 6: Plan the Change (5 min)

**Write down:**

1. **What files need to change?**
   - List all files
   - Check dependencies

2. **What's the sequence?**
   - Database migration first?
   - Backend API before frontend?
   - Validation schema before endpoint?

3. **What could break?**
   - Existing features
   - External integrations
   - User workflows

4. **How to test?**
   - Manual test steps
   - Expected results
   - Edge cases

**Why:** Comprehensive changes, not piecemeal fixes.

---

## Step 7: One Comprehensive Commit

**DO:**
- [ ] Fix ALL related issues in one commit
- [ ] Run `npx tsc --noEmit` before commit
- [ ] Test manually before commit
- [ ] Write clear commit message

**DON'T:**
- [ ] ❌ Make incremental "fix" commits
- [ ] ❌ Push without type checking
- [ ] ❌ Push without testing
- [ ] ❌ Make assumptions

**Why:** From CLAUDE.md - "One-Commit Rule"

---

## Step 8: Verify Type Safety (2 min)

```bash
npx tsc --noEmit
```

- [ ] Zero TypeScript errors
- [ ] No `any` types used
- [ ] Proper type imports

**Why:** Catch errors before deployment.

---

## Step 9: Test Manually (5 min)

**Full flow test:**

- [ ] Create order (if changed order creation)
- [ ] Confirm order (if changed confirmation)
- [ ] Create Sendit shipment (if changed Sendit)
- [ ] Check totals are correct
- [ ] Check phone format is correct
- [ ] Test with invalid data (should reject)

**Why:** Type checking != feature working.

---

## Step 10: Document (If New Feature)

**Add to:**
- [ ] `docs/PROJECT_OVERVIEW.md` if new feature
- [ ] `docs/PREVENTION_SYSTEM.md` if new validation
- [ ] Comments in code for non-obvious logic

**Why:** Future me (and future Claude) need to understand.

---

## Special Cases

### Adding New Validation

1. Add to `lib/validation/order.ts`
2. Use in API endpoint
3. Test with invalid data
4. Document in `PREVENTION_SYSTEM.md`

### Changing Phone Format

1. Update `lib/utils/phone.ts`
2. Update validation regex
3. Test with Sendit API (create real shipment)
4. Update documentation

### Changing Number Calculation

1. Update `lib/utils/numbers.ts`
2. Update validation schema if needed
3. Test with edge cases (0, negative, huge numbers)
4. Test string concat scenario

### Changing Database Schema

1. Create migration SQL
2. Update TypeScript types
3. Update Zod schemas
4. Update API endpoints
5. Update frontend
6. Test migration on dev database first

---

## Red Flags (STOP and Rethink)

🚨 **If you're about to:**

- Use `any` type → Use proper types
- Assume data type → Validate first
- Call external API → Check format requirements
- Make multiple "fix" commits → Do one comprehensive change
- Skip type checking → Always run `tsc --noEmit`
- Forget phone formatting → Use `formatPhoneForSendit()`
- Do string concatenation → Use number utilities
- Ignore CLAUDE.md rules → Re-read CLAUDE.md

---

## Example: Fixing Phone Format Bug

### ❌ Wrong Approach
```typescript
// Just change the code and push
phone: order.phone  // Hope it works!
```

### ✅ Right Approach

1. **Read docs:** Check PROJECT_OVERVIEW.md → Sendit requirements
2. **Search code:** `grep -r "formatPhone" .` → Found utility!
3. **Check dependencies:** Where is phone used? Sendit only? Or elsewhere?
4. **Plan:** 
   - Update `lib/sendit.ts` to use `formatPhoneForSendit()`
   - Update validation schema to enforce format
   - Test with spaces, invalid formats
5. **Implement:** All changes in one commit
6. **Type check:** `npx tsc --noEmit`
7. **Test:** Create order with "06 12 34 56 78"
8. **Verify:** Sendit accepts formatted phone
9. **Document:** Update PREVENTION_SYSTEM.md
10. **Commit:** One commit with clear message

---

## Time Estimate

**Total: 20-30 minutes before first line of code**

**Worth it?** YES.
- Prevents hours of debugging
- Prevents breaking other features
- Prevents user-facing bugs
- Prevents frustration

---

## Checklist Summary

Before ANY change:

1. ☐ Read documentation (2 min)
2. ☐ Search existing code (3 min)
3. ☐ Check dependencies (2 min)
4. ☐ Verify external APIs (if applicable)
5. ☐ Check data types (1 min)
6. ☐ Plan the change (5 min)
7. ☐ One comprehensive commit
8. ☐ Verify type safety (2 min)
9. ☐ Test manually (5 min)
10. ☐ Document (if new feature)

**Total: 20-30 min → Saves hours of debugging**

---

**Follow this checklist EVERY TIME. No exceptions.** 🎯
