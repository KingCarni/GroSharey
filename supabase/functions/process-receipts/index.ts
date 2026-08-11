import { createClient } from '@supabase/supabase-js';

type ReceiptRow = {
  id: string;
  household_id: string;
  storage_path: string;
  store_name: string | null;
  total_amount: number | null;
  currency: string;
  purchased_at: string;
};

type ParsedItem = {
  raw_name: string;
  normalized_name: string | null;
  brand: string | null;
  category: string | null;
  quantity: number | null;
  size: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  confidence: number;
};

type ParsedReceipt = {
  merchant: string | null;
  purchased_at: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  confidence: number;
  items: ParsedItem[];
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const googleVisionApiKey = Deno.env.get('GOOGLE_VISION_API_KEY');
const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
const openAiModel = Deno.env.get('OPENAI_RECEIPT_MODEL') ?? 'gpt-5-mini';
const parserVersion = 'vision-openai-v2';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function clampConfidence(value: unknown, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}

function numberOcrLines(rawText: string) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 1000)
    .map((line, index) => `${index + 1}: ${line}`)
    .join('\n');
}

function reconcileConfidence(parsed: ParsedReceipt): ParsedReceipt {
  const pricedItems = parsed.items.filter((item) => item.line_total != null);
  if (pricedItems.length === 0) return parsed;

  const itemTotal = pricedItems.reduce((sum, item) => sum + Number(item.line_total ?? 0), 0);
  const merchandiseTarget = parsed.total != null
    ? Math.max(0, parsed.total - Number(parsed.tax ?? 0))
    : parsed.subtotal;

  if (merchandiseTarget == null || merchandiseTarget <= 0) return parsed;

  const difference = Math.abs(itemTotal - merchandiseTarget);
  const relativeDifference = difference / Math.max(merchandiseTarget, 1);

  let ceiling = 1;
  if (difference > 0.05 && relativeDifference > 0.1) ceiling = 0.45;
  else if (difference > 0.05 && relativeDifference > 0.05) ceiling = 0.6;
  else if (difference > 0.05 && relativeDifference > 0.02) ceiling = 0.72;
  else if (difference > 0.05) ceiling = 0.85;

  return {
    ...parsed,
    confidence: Math.min(parsed.confidence, ceiling),
  };
}

async function extractTextWithGoogleVision(imageBytes: Uint8Array) {
  if (!googleVisionApiKey) throw new Error('GOOGLE_VISION_API_KEY is not configured.');

  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(googleVisionApiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image: { content: bytesToBase64(imageBytes) },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      }],
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(`Google Vision failed (${response.status}): ${JSON.stringify(payload)}`);
  const first = payload?.responses?.[0];
  if (first?.error?.message) throw new Error(`Google Vision: ${first.error.message}`);
  const text = first?.fullTextAnnotation?.text ?? first?.textAnnotations?.[0]?.description ?? '';
  if (!String(text).trim()) throw new Error('Google Vision did not detect receipt text.');
  return String(text).trim();
}

const receiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['merchant', 'purchased_at', 'currency', 'subtotal', 'tax', 'total', 'confidence', 'items'],
  properties: {
    merchant: { type: ['string', 'null'] },
    purchased_at: { type: ['string', 'null'], description: 'ISO 8601 date or datetime when confidently present.' },
    currency: { type: ['string', 'null'], description: 'Three-letter ISO currency code when inferable.' },
    subtotal: { type: ['number', 'null'] },
    tax: { type: ['number', 'null'] },
    total: { type: ['number', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['raw_name', 'normalized_name', 'brand', 'category', 'quantity', 'size', 'unit', 'unit_price', 'line_total', 'confidence'],
        properties: {
          raw_name: { type: 'string' },
          normalized_name: { type: ['string', 'null'] },
          brand: { type: ['string', 'null'] },
          category: { type: ['string', 'null'] },
          quantity: { type: ['number', 'null'] },
          size: { type: ['number', 'null'] },
          unit: { type: ['string', 'null'] },
          unit_price: { type: ['number', 'null'] },
          line_total: { type: ['number', 'null'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
};

async function parseReceiptWithOpenAI(rawText: string, fallbackCurrency: string): Promise<ParsedReceipt> {
  if (!openAiApiKey) throw new Error('OPENAI_API_KEY is not configured.');

  const numberedText = numberOcrLines(rawText);
  const prompt = `You are a grocery receipt parser. Convert OCR text into structured receipt data.

The OCR lines below are numbered only to make adjacency clear. Do not include line numbers in raw_name.

CORE RULES:
- Never invent items, brands, quantities, discounts or prices.
- Exclude subtotal, total, net sales, tax, deposits, loyalty summaries, payment/tender lines and savings-summary lines from items unless they are clearly purchased products.
- Preserve the actual abbreviated product text in raw_name.
- normalized_name should be conservative and human readable. Expand obvious grocery abbreviations, but do not guess a specific product variant that is not supported.
- quantity means count purchased when explicit. Use 1 only when one product line clearly represents one unit. For weighted produce, prefer size + unit rather than treating the weight as quantity.
- Use null when uncertain.
- Currency fallback is ${fallbackCurrency || 'CAD'}.

DISCOUNT ASSOCIATION RULES — FOLLOW THESE STRICTLY:
- A sale, coupon, loyalty, member, Prime, digital coupon, markdown or percentage-discount line immediately following a product modifies ONLY the most recent product above it.
- Discount lines continue to belong to that same product only while they are contiguous. Stop the moment the next product line begins.
- NEVER carry a discount forward to the next product.
- A sale line can contain BOTH the new sale price and the savings amount. Do not subtract both as separate discounts if they represent the same price transition.
- Example:
  ITEM                                    $2.99
  *Sale*                         $2.69    -$0.30
  Prime Extra 10.00%                      -$0.27
  means the final line_total is $2.42. The $2.69 value is the intermediate sale price; -$0.30 already explains the change from $2.99 to $2.69, so do NOT subtract $2.69 or subtract the $0.30 twice.
- If a product is $5.99 and the PREVIOUS product has a -$0.27 discount beneath it, the $5.99 product remains $5.99. Never bleed the previous discount into it.
- line_total is the final amount charged for that product line after discounts that clearly belong to that product.
- unit_price is the per-item or per-weight-unit price when explicitly supported. For a normal single-item line without a separate unit price, unit_price may equal line_total.

QUANTITY / WEIGHT RULES:
- Example: "3 @ $1.49 ea   $4.47" => quantity 3, unit_price 1.49, line_total 4.47.
- Example: "1.90 lb @ $0.49/lb   $0.93" => size 1.90, unit "lb", unit_price 0.49, line_total 0.93; quantity may be null.
- Do not create separate items from tare-weight lines.

RECONCILIATION RULES:
- Parse every actual purchased product line, even when multiple physical units are represented by one line with quantity > 1.
- Sum of final item line_total values should be consistent with the merchandise amount actually paid, allowing for tax, deposits, fees, coupons and receipt rounding.
- Do NOT force prices to reconcile by inventing adjustments. If the receipt is ambiguous, leave uncertain values null and lower confidence instead.
- Receipt subtotal, tax and total must come from explicit receipt summary lines whenever possible.

OCR TEXT:
${numberedText.slice(0, 36000)}`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: openAiModel,
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'grosharey_receipt',
          strict: true,
          schema: receiptSchema,
        },
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(`OpenAI parse failed (${response.status}): ${JSON.stringify(payload)}`);

  const direct = typeof payload?.output_text === 'string' ? payload.output_text : null;
  const nested = payload?.output
    ?.flatMap((entry: { content?: { type?: string; text?: string }[] }) => entry.content ?? [])
    ?.find((content: { type?: string; text?: string }) => content.type === 'output_text')?.text;
  const outputText = direct ?? nested;
  if (!outputText) throw new Error('OpenAI returned no structured receipt output.');

  const parsed = JSON.parse(outputText) as ParsedReceipt;
  return reconcileConfidence({
    merchant: parsed.merchant?.trim() || null,
    purchased_at: parsed.purchased_at || null,
    currency: parsed.currency?.trim().toUpperCase() || fallbackCurrency || 'CAD',
    subtotal: asNullableNumber(parsed.subtotal),
    tax: asNullableNumber(parsed.tax),
    total: asNullableNumber(parsed.total),
    confidence: clampConfidence(parsed.confidence),
    items: Array.isArray(parsed.items)
      ? parsed.items
          .filter((item) => item?.raw_name?.trim())
          .map((item) => ({
            raw_name: item.raw_name.trim(),
            normalized_name: item.normalized_name?.trim() || null,
            brand: item.brand?.trim() || null,
            category: item.category?.trim() || null,
            quantity: asNullableNumber(item.quantity),
            size: asNullableNumber(item.size),
            unit: item.unit?.trim() || null,
            unit_price: asNullableNumber(item.unit_price),
            line_total: asNullableNumber(item.line_total),
            confidence: clampConfidence(item.confidence),
          }))
      : [],
  });
}

async function processReceipt(supabase: ReturnType<typeof createClient>, receipt: ReceiptRow) {
  await supabase.from('receipts').update({ parse_status: 'processing', parse_error: null }).eq('id', receipt.id);

  try {
    const { data: imageBlob, error: downloadError } = await supabase.storage.from('receipts').download(receipt.storage_path);
    if (downloadError || !imageBlob) throw downloadError ?? new Error('Receipt image could not be downloaded.');

    const imageBytes = new Uint8Array(await imageBlob.arrayBuffer());
    const rawText = await extractTextWithGoogleVision(imageBytes);
    const parsed = await parseReceiptWithOpenAI(rawText, receipt.currency);

    const purchasedAt = parsed.purchased_at && !Number.isNaN(new Date(parsed.purchased_at).getTime())
      ? new Date(parsed.purchased_at).toISOString()
      : receipt.purchased_at;

    await supabase.from('receipt_items').delete().eq('receipt_id', receipt.id);
    await supabase.from('price_observations').delete().eq('receipt_id', receipt.id);

    if (parsed.items.length > 0) {
      const { data: insertedItems, error: itemsError } = await supabase
        .from('receipt_items')
        .insert(parsed.items.map((item, index) => ({
          receipt_id: receipt.id,
          household_id: receipt.household_id,
          line_number: index + 1,
          ...item,
        })))
        .select('id, raw_name, quantity, unit_price, line_total, confidence');
      if (itemsError) throw itemsError;

      const observations = (insertedItems ?? [])
        .filter((item) => item.line_total != null || item.unit_price != null)
        .map((item) => ({
          household_id: receipt.household_id,
          receipt_id: receipt.id,
          receipt_item_id: item.id,
          raw_product_name: item.raw_name,
          price: Number(item.line_total ?? item.unit_price),
          quantity: item.quantity,
          unit_price: item.unit_price,
          currency: parsed.currency ?? receipt.currency ?? 'CAD',
          observed_at: purchasedAt,
          source: 'receipt',
          confidence: clampConfidence(item.confidence),
          is_community_eligible: false,
        }));
      if (observations.length > 0) {
        const { error: observationsError } = await supabase.from('price_observations').insert(observations);
        if (observationsError) throw observationsError;
      }
    }

    const { error: receiptError } = await supabase
      .from('receipts')
      .update({
        store_name: parsed.merchant ?? receipt.store_name,
        subtotal_amount: parsed.subtotal,
        tax_amount: parsed.tax,
        total_amount: parsed.total ?? receipt.total_amount,
        currency: parsed.currency ?? receipt.currency ?? 'CAD',
        purchased_at: purchasedAt,
        raw_text: rawText,
        parse_status: 'complete',
        parse_confidence: parsed.confidence,
        parse_error: null,
        parsed_at: new Date().toISOString(),
        parser_version: parserVersion,
      })
      .eq('id', receipt.id);
    if (receiptError) throw receiptError;

    return { id: receipt.id, status: 'complete', items: parsed.items.length, confidence: parsed.confidence };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown receipt processing error';
    await supabase.from('receipts').update({
      parse_status: 'failed',
      parse_error: message.slice(0, 2000),
      parsed_at: new Date().toISOString(),
      parser_version: parserVersion,
    }).eq('id', receipt.id);
    return { id: receipt.id, status: 'failed', error: message };
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Missing Supabase environment.' }, 500);
  if (!googleVisionApiKey || !openAiApiKey) return json({ error: 'OCR/parser secrets are not configured.' }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let requestedReceiptId: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    requestedReceiptId = typeof body?.receipt_id === 'string' ? body.receipt_id : null;
  } catch {
    requestedReceiptId = null;
  }

  let query = supabase
    .from('receipts')
    .select('id, household_id, storage_path, store_name, total_amount, currency, purchased_at')
    .eq('parse_status', 'pending')
    .is('deleted_at', null)
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: true })
    .limit(requestedReceiptId ? 1 : 5);

  if (requestedReceiptId) query = query.eq('id', requestedReceiptId);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const receipts = (data ?? []) as ReceiptRow[];
  const results = [];
  for (const receipt of receipts) results.push(await processReceipt(supabase, receipt));

  return json({ processed: results.length, results });
});
