# Bug Prevention System

**Status:** ✅ ACTIVE  
**Last Updated:** 2026-06-05

## Purpose

Stop bugs BEFORE they enter the system. Validate data at API boundaries, not in the database.

---

## Layer 1: Input Validation (Zod)

### Location
- `lib/validation/order.ts` - All order-related schemas

### What It Does
- **Validates ALL incoming data** before processing
- **Transforms strings → numbers** (prevents "330" + "19" = "33019")
- **Enforces formats** (phone: 06XXXXXXXX, amounts: integers)
- **Returns clear errors** (field-specific, actionable)

### Usage Example

```typescript
import { CreateOrderSchema } from '@/lib/validation/order'

// In API endpoint:
const validation = CreateOrderSchema.safeParse(body)

if (!validation.success) {
  return NextResponse.json({
    error: 'Validation failed',
    details: validation.error.flatten().fieldErrors
  }, { status: 400 })
}

// Now data is 100% validated and type-safe
const { total, phone, items } = validation.data
```

### Key Schemas

#### CreateOrderSchema
- Validates: name, phone, city, items, pricing
- Transforms: Converts string numbers → actual numbers
- Calculates: Total server-side (can't be manipulated)
- Returns: Validated data + calculated totals

#### SenditShipmentSchema
- Validates: Phone format, amount limits
- Enforces: Amount ≤ 5000 DH, phone = 06/07XXXXXXXX
- Transforms: Amount → integer (Sendit requirement)

---

## Layer 2: Phone Number Utilities

### Location
- `lib/utils/phone.ts`

### Functions

#### `normalizeMoroccoPhone(phone: string): string`
- Input: "06 12 34 56 78" or "+212612345678"  
- Output: "0612345678"  
- Throws: Error if invalid format

#### `formatPhoneForSendit(phone: string): string`
- Formats phone for Sendit API  
- Prevents: "Le format du champ phone est invalide"

#### `isValidMoroccoPhone(phone: string): boolean`
- Check if phone is valid without throwing

### Usage

```typescript
import { formatPhoneForSendit } from '@/lib/utils/phone'

// Before sending to Sendit:
const formattedPhone = formatPhoneForSendit(order.deliveryPhone)

// Sendit receives: "0612345678" ✓ (valid)
// Not: "06 12 34 56 78" ✗ (invalid)
```

---

## Layer 3: Safe Number Operations

### Location
- `lib/utils/numbers.ts`

### Functions

#### `toNumber(value, fieldName): number`
- Converts to number safely  
- Throws: If not a valid number  
- Use: When you need any number

#### `toPositiveNumber(value, fieldName): number`
- Ensures number > 0  
- Use: Prices, amounts, quantities

#### `toInteger(value, fieldName): number`
- Rounds to integer  
- Use: Sendit amounts (must be whole numbers)

#### `calculateOrderTotal(products, discount, delivery): number`
- Safe total calculation  
- Prevents: String concatenation ("330" + "19" = "33019")  
- Returns: Correct math (330 + 19 = 349)

### Usage

```typescript
import { calculateOrderTotal } from '@/lib/utils/numbers'

// Safe calculation (no string concat possible):
const total = calculateOrderTotal(
  productsTotal,    // Could be string from form
  discountTotal,    // Could be string from form
  deliveryFee       // Could be string from form
)

// Always returns number, never "33019" bug
```

---

## Layer 4: Sendit Integration Hardening

### Location
- `lib/sendit.ts`

### Validations Before API Call

1. **Phone Format**
   ```typescript
   const formattedPhone = formatPhoneForSendit(shipment.recipient_phone)
   // Throws clear error if invalid
   ```

2. **Amount Validation**
   ```typescript
   const amount = toInteger(shipment.cod_amount)
   if (amount > 5000) throw new Error('Max 5000 DH')
   ```

3. **Minimum Requirements**
   - Name ≥ 2 characters
   - Address ≥ 5 characters
   - District ID valid

### Result
- **No more 422 errors from Sendit**
- **Clear errors before API call**
- **User gets actionable feedback**

---

## Layer 5: Endpoint Integration

### Order Creation (BOS)
**File:** `app/api/ops/orders/route.ts`

**Before (Manual Validation):**
```typescript
const discountTotal = Number(body.discountTotal) || 0  // ⚠️ Risky
if (!deliveryName) return error  // ⚠️ Incomplete
```

**After (Zod Validation):**
```typescript
const validation = CreateOrderSchema.safeParse(body)
if (!validation.success) return validation.error  // ✅ Complete

const { total, phone, items } = validation.data  // ✅ Type-safe
```

### Benefits
- **All fields validated** (not just some)
- **Type-safe data** (TypeScript knows exact types)
- **No string concatenation** (numbers are numbers)
- **Clear error messages** (field-specific)

---

## How To Use This System

### For New Endpoints

1. **Create schema** in `lib/validation/`
2. **Import schema** in endpoint
3. **Validate early**:
   ```typescript
   const result = MySchema.safeParse(body)
   if (!result.success) return error
   const data = result.data  // Type-safe!
   ```

### For Phone Numbers

Always use utilities:
```typescript
import { formatPhoneForSendit } from '@/lib/utils/phone'
const phone = formatPhoneForSendit(userInput)
```

### For Number Calculations

Always use safe functions:
```typescript
import { calculateOrderTotal } from '@/lib/utils/numbers'
const total = calculateOrderTotal(products, discount, delivery)
```

---

## Testing Checklist

Before deploying changes:

1. **Type Check**
   ```bash
   npx tsc --noEmit
   ```

2. **Test Invalid Data**
   - Try invalid phone: "123456"
   - Try string concat: amount = "330", fee = "19"
   - Try amount > 5000

3. **Check Error Messages**
   - Are they clear?
   - Do they tell user HOW to fix?

4. **Test Sendit Integration**
   - Create order → Confirm → Sendit shipment
   - Check Sendit shows correct data

---

## Common Bugs This Prevents

| Bug | How Prevented |
|-----|---------------|
| "33019" (string concat) | Numbers enforced by Zod |
| Phone format error | formatPhoneForSendit() |
| Amount > 5000 DH | SenditShipmentSchema validation |
| Invalid total | calculateOrderTotal() |
| Missing required fields | Zod schema .required() |
| Type mismatches | TypeScript + Zod |

---

## When You See a Bug

1. **Add test case** to schema
2. **Update validation** to catch it
3. **Document** in this file
4. **Deploy** - bug can't happen again

---

## Maintenance

### When Adding New Fields

Update schemas in `lib/validation/order.ts`:
```typescript
export const CreateOrderSchema = z.object({
  // ... existing fields
  newField: z.string().min(1),  // Add validation
})
```

### When Changing Phone Format

Update utilities in `lib/utils/phone.ts`

### When Changing Number Rules

Update utilities in `lib/utils/numbers.ts`

---

## Success Metrics

**After this system:**
- ✅ Zero "invalid phone format" errors
- ✅ Zero string concatenation bugs
- ✅ Zero "amount exceeds 5000" after validation
- ✅ Clear error messages for users
- ✅ Type-safe throughout codebase

**Before this system:**
- ❌ Bugs discovered in production
- ❌ Cryptic Sendit errors
- ❌ Manual debugging required
- ❌ Data quality issues

---

## Future Improvements

1. **Add contract tests** for Sendit API
2. **Add monitoring** for validation failures
3. **Create validation UI** components
4. **Add validation to frontend** forms

---

**Remember:** Validation at the boundary = bugs can't enter system. 🛡️
