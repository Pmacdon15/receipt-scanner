"use client"

import * as React from "react"
import {
  CameraIcon,
  Loader2Icon,
  PencilLineIcon,
  SplitIcon,
  ScanLineIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  extractReceiptAction,
  scanReceiptAction,
  suggestReceiptTypeAction,
  type ScanFormState,
} from "@/app/actions/receipts"
import {
  ScanCapture,
  type CapturedImage,
} from "@/components/scanner/scan-capture"
import {
  newSplitRow,
  serializeSplitRows,
  SplitEditor,
  type SplitRow,
} from "@/components/scanner/split-editor"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { parseMoneyToCents } from "@/lib/money"
import { RECEIPT_TYPES, receiptTypeLabel } from "@/lib/receipt-types"
import {
  type ExtractedFields,
  fieldErrorsFrom,
  scanReceiptFormSchema,
  suggestReceiptTypeInputSchema,
  type ScanReceiptField,
} from "@/lib/schemas"

const AUTO = ""

// Defined here rather than exported from the actions module: every export of a
// "use server" file must be an async function.
const INITIAL_STATE: ScanFormState = {
  status: "idle",
  message: "",
  fieldErrors: {},
}

const SELECT_ITEMS: Record<string, React.ReactNode> = {
  [AUTO]: "Detect automatically",
  ...Object.fromEntries(RECEIPT_TYPES.map((t) => [t.id, t.label])),
}

type Suggestion = {
  type: string
  confidence: number
  /** "photo" when it came from reading the photo, "text" from keywords. */
  source: "photo" | "text"
} | null

/** Whether the user is attaching a photo or typing the receipt in by hand. */
type Mode = "scan" | "manual"

export function ScanForm() {
  const formRef = React.useRef<HTMLFormElement>(null)
  const [state, setState] = React.useState<ScanFormState>(INITIAL_STATE)
  const [isPending, startSubmitting] = React.useTransition()

  const [merchant, setMerchant] = React.useState("")
  const [rawText, setRawText] = React.useState("")
  const [purchasedOn, setPurchasedOn] = React.useState("")
  const [total, setTotal] = React.useState("")
  const [subtotal, setSubtotal] = React.useState("")
  const [tax, setTax] = React.useState("")
  const [receiptType, setReceiptType] = React.useState<string>(AUTO)
  const [suggestion, setSuggestion] = React.useState<Suggestion>(null)
  const [isDetecting, startDetecting] = React.useTransition()

  // What reading the photo guessed. Beats the keyword suggestion, and is
  // posted with the form so saving on "detect automatically" uses it.
  const [photoGuess, setPhotoGuess] = React.useState<Suggestion>(null)
  const [isReading, startReading] = React.useTransition()
  const readingPathRef = React.useRef<string | null>(null)

  // A receipt can be spread across several categories, each with its amount.
  const [isSplit, setIsSplit] = React.useState(false)
  const [splitRows, setSplitRows] = React.useState<SplitRow[]>([])

  const [mode, setMode] = React.useState<Mode>("scan")
  const [capture, setCapture] = React.useState<CapturedImage | null>(null)

  // Preview what detection would pick, so the user can see the auto choice
  // before anything is saved. The debounce callback owns every state update
  // here, so nothing is set synchronously while the effect runs.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (merchant.trim() === "" && rawText.trim() === "") {
        setSuggestion(null)
        return
      }

      // Text the server would reject anyway (too long) is not worth a round
      // trip; the save-time validation reports it.
      const input = suggestReceiptTypeInputSchema.safeParse({
        merchant,
        rawText,
      })
      if (!input.success) {
        setSuggestion(null)
        return
      }

      startDetecting(async () => {
        const result = await suggestReceiptTypeAction(input.data)
        setSuggestion(
          result.status === "success" && result.confidence > 0
            ? {
                type: result.type,
                confidence: result.confidence,
                source: "text",
              }
            : null
        )
      })
    }, 400)

    return () => clearTimeout(timer)
  }, [merchant, rawText])

  // Fills only the fields the user has left empty, so reading the photo never
  // overwrites something they typed.
  function applyExtracted(fields: ExtractedFields) {
    const fill =
      (value: string | undefined) =>
      (current: string) =>
        current.trim() === "" && value ? value : current

    setMerchant(fill(fields.merchant))
    setPurchasedOn(fill(fields.purchasedOn))
    setTotal(fill(fields.total))
    setSubtotal(fill(fields.subtotal))
    setTax(fill(fields.tax))
    setRawText(fill(fields.rawText))

    if (fields.receiptType) {
      setPhotoGuess({
        type: fields.receiptType,
        confidence: fields.confidence ?? 0.5,
        source: "photo",
      })
    }

    if (fields.splits && fields.splits.length >= 2 && !isSplit) {
      setIsSplit(true)
      setSplitRows(fields.splits.map((s) => newSplitRow(s.type, s.amount)))
    }
  }

  function handleCapture(next: CapturedImage | null) {
    setCapture(next)
    setPhotoGuess(null)
    readingPathRef.current = next?.pathname ?? null
    if (!next) return

    startReading(async () => {
      const result = await extractReceiptAction(next.pathname)
      // The user may have retaken the photo while this one was being read.
      if (readingPathRef.current !== next.pathname) return

      if (result.status === "error") {
        toast.error(result.message)
      } else if (result.recognised) {
        applyExtracted(result.fields)
        toast.success("Read the receipt. Check the details before saving.")
      }
    })
  }

  function startSplit() {
    const type = receiptType !== AUTO ? receiptType : (activeGuess?.type ?? "")
    setSplitRows([newSplitRow(type, total), newSplitRow()])
    setIsSplit(true)
  }

  function handleSubmit(formData: FormData) {
    // Check in the browser first so mistakes show up without a round trip.
    // The action re-validates with the same schema.
    const parsed = scanReceiptFormSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
      const message = "Fix the highlighted fields and try again."
      setState({
        status: "error",
        message,
        fieldErrors: fieldErrorsFrom<ScanReceiptField>(parsed.error),
      })
      toast.error(message)
      return
    }

    startSubmitting(async () => {
      const result = await scanReceiptAction(state, formData)
      setState(result)

      if (result.status === "success") {
        toast.success(result.message)
        formRef.current?.reset()
        setMerchant("")
        setRawText("")
        setPurchasedOn("")
        setTotal("")
        setSubtotal("")
        setTax("")
        setReceiptType(AUTO)
        setSuggestion(null)
        setPhotoGuess(null)
        setIsSplit(false)
        setSplitRows([])
        readingPathRef.current = null
        setCapture(null)
      } else {
        toast.error(result.message)
      }
    })
  }

  const activeGuess = photoGuess ?? suggestion
  const effectiveType = receiptType === AUTO ? activeGuess?.type : receiptType

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scan a receipt</CardTitle>
        <CardDescription>
          Scan a photo and the details are read off it, or type the receipt
          in. Split it across categories when it covers more than one.
        </CardDescription>
      </CardHeader>

      <form ref={formRef} action={handleSubmit}>
        <CardContent className="grid gap-5">
          <Tabs
            value={mode}
            onValueChange={(value) => {
              const next = (value ?? "scan") as Mode
              setMode(next)
              // Leaving scan mode drops the photo, so switching away cannot
              // post an image the user thinks they abandoned.
              if (next === "manual") handleCapture(null)
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="scan" className="flex-1">
                <ScanLineIcon />
                Scan a photo
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex-1">
                <PencilLineIcon />
                Enter by hand
              </TabsTrigger>
            </TabsList>

            <TabsContent value="scan" className="mt-4 grid gap-2">
              <ScanCapture
                value={capture}
                onChange={handleCapture}
                disabled={isPending}
              />
              {isReading ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2Icon className="size-3 animate-spin" />
                  Reading the receipt
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  The details are read off the photo and filled in below.
                  Anything you have already typed is left alone.
                </p>
              )}
              {(state.fieldErrors.image || state.fieldErrors.imagePathname) && (
                <p className="text-xs text-destructive">
                  {state.fieldErrors.image || state.fieldErrors.imagePathname}
                </p>
              )}
            </TabsContent>
          </Tabs>

          {/* Posts the uploaded photo's blob pathname, not the photo itself —
              the bytes went straight to the store from ScanCapture. Empty in
              manual mode, which the action reads as "no image". */}
          <input
            type="hidden"
            name="imagePathname"
            value={mode === "scan" ? (capture?.pathname ?? "") : ""}
          />
          <input
            type="hidden"
            name="detectedType"
            value={photoGuess?.type ?? ""}
          />
          <input
            type="hidden"
            name="detectedConfidence"
            value={photoGuess ? String(photoGuess.confidence) : ""}
          />
          <input
            type="hidden"
            name="splits"
            value={isSplit ? serializeSplitRows(splitRows) : ""}
          />

          <div className="grid gap-2">
            <Label htmlFor="merchant">Merchant</Label>
            <Input
              id="merchant"
              name="merchant"
              placeholder="Mountain View Grocery"
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors.merchant)}
              required
            />
            <FieldError message={state.fieldErrors.merchant} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="purchasedOn">Date</Label>
              <Input
                id="purchasedOn"
                name="purchasedOn"
                type="date"
                value={purchasedOn}
                onChange={(event) => setPurchasedOn(event.target.value)}
                aria-invalid={Boolean(state.fieldErrors.purchasedOn)}
              />
              <FieldError message={state.fieldErrors.purchasedOn} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="total">Total</Label>
              <Input
                id="total"
                name="total"
                inputMode="decimal"
                placeholder="42.17"
                value={total}
                onChange={(event) => setTotal(event.target.value)}
                aria-invalid={Boolean(state.fieldErrors.total)}
                required
              />
              <FieldError message={state.fieldErrors.total} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="subtotal">Subtotal</Label>
              <Input
                id="subtotal"
                name="subtotal"
                inputMode="decimal"
                placeholder="Optional"
                value={subtotal}
                onChange={(event) => setSubtotal(event.target.value)}
                aria-invalid={Boolean(state.fieldErrors.subtotal)}
              />
              <FieldError message={state.fieldErrors.subtotal} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tax">Tax</Label>
              <Input
                id="tax"
                name="tax"
                inputMode="decimal"
                placeholder="Optional"
                value={tax}
                onChange={(event) => setTax(event.target.value)}
                aria-invalid={Boolean(state.fieldErrors.tax)}
              />
              <FieldError message={state.fieldErrors.tax} />
            </div>
          </div>

          {isSplit ? (
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Categories</Label>
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  disabled={isPending}
                  onClick={() => {
                    setIsSplit(false)
                    setSplitRows([])
                  }}
                >
                  Use one category
                </Button>
              </div>
              <SplitEditor
                rows={splitRows}
                onChange={setSplitRows}
                totalCents={parseMoneyToCents(total)}
                error={state.fieldErrors.splits}
                disabled={isPending}
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="receiptType">Receipt type</Label>
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  disabled={isPending}
                  onClick={startSplit}
                >
                  <SplitIcon />
                  Split across categories
                </Button>
              </div>

              <Select
                items={SELECT_ITEMS}
                value={receiptType}
                onValueChange={(value) => setReceiptType(String(value ?? AUTO))}
                name="receiptType"
              >
                <SelectTrigger id="receiptType" className="w-full">
                  <SelectValue placeholder="Detect automatically" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>Detect automatically</SelectItem>
                  {RECEIPT_TYPES.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DetectionHint
                isDetecting={isDetecting && !photoGuess}
                suggestion={activeGuess}
                isAuto={receiptType === AUTO}
                onAccept={(type) => setReceiptType(type)}
              />

              <FieldError message={state.fieldErrors.receiptType} />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="rawText">Receipt text</Label>
            <Textarea
              id="rawText"
              name="rawText"
              rows={4}
              placeholder="Paste the receipt text here — it sharpens the detected category."
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              aria-invalid={Boolean(state.fieldErrors.rawText)}
            />
            <FieldError message={state.fieldErrors.rawText} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              name="notes"
              placeholder="Optional"
              aria-invalid={Boolean(state.fieldErrors.notes)}
            />
            <FieldError message={state.fieldErrors.notes} />
          </div>
        </CardContent>

        <CardFooter className="flex-col items-stretch gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Saving as{" "}
            <span className="font-medium text-foreground">
              {isSplit
                ? `a split across ${splitRows.length} categories`
                : effectiveType
                  ? receiptTypeLabel(effectiveType)
                  : "Other"}
            </span>
          </p>

          <Button type="submit" disabled={isPending} className="sm:w-auto">
            {isPending && <Loader2Icon className="animate-spin" />}
            {isPending ? "Saving" : "Save receipt"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function DetectionHint({
  isDetecting,
  suggestion,
  isAuto,
  onAccept,
}: {
  isDetecting: boolean
  suggestion: Suggestion
  isAuto: boolean
  onAccept: (type: string) => void
}) {
  if (isDetecting) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" />
        Detecting type
      </p>
    )
  }

  if (!suggestion) {
    return (
      <p className="text-xs text-muted-foreground">
        Add a merchant or receipt text and a type will be suggested here.
      </p>
    )
  }

  const percent = Math.round(suggestion.confidence * 100)

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {suggestion.source === "photo" ? (
        <CameraIcon className="size-3" />
      ) : (
        <SparklesIcon className="size-3" />
      )}
      <span>
        {suggestion.source === "photo" ? "Read from photo" : "Detected"}
      </span>
      <Badge variant="secondary" className="gap-1">
        {receiptTypeLabel(suggestion.type)}
        <span className="opacity-70">{percent}%</span>
      </Badge>

      {isAuto ? (
        <span>— will be used unless you pick one.</span>
      ) : (
        <Button
          type="button"
          variant="link"
          size="xs"
          onClick={() => onAccept(suggestion.type)}
        >
          <WandSparklesIcon />
          Use detected
        </Button>
      )}
    </div>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive">{message}</p>
}
