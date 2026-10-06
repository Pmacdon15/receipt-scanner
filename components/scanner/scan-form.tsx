"use client"

import * as React from "react"
import {
  Loader2Icon,
  PencilLineIcon,
  ScanLineIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  scanReceiptAction,
  suggestReceiptTypeAction,
  type ScanFormState,
} from "@/app/actions/receipts"
import {
  ScanCapture,
  type CapturedImage,
} from "@/components/scanner/scan-capture"
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
import { RECEIPT_TYPES, receiptTypeLabel } from "@/lib/receipt-types"
import {
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

type Suggestion = { type: string; confidence: number } | null

/** Whether the user is attaching a photo or typing the receipt in by hand. */
type Mode = "scan" | "manual"

export function ScanForm() {
  const formRef = React.useRef<HTMLFormElement>(null)
  const [state, setState] = React.useState<ScanFormState>(INITIAL_STATE)
  const [isPending, startSubmitting] = React.useTransition()

  const [merchant, setMerchant] = React.useState("")
  const [rawText, setRawText] = React.useState("")
  const [receiptType, setReceiptType] = React.useState<string>(AUTO)
  const [suggestion, setSuggestion] = React.useState<Suggestion>(null)
  const [isDetecting, startDetecting] = React.useTransition()

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
            ? { type: result.type, confidence: result.confidence }
            : null
        )
      })
    }, 400)

    return () => clearTimeout(timer)
  }, [merchant, rawText])

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
        setReceiptType(AUTO)
        setSuggestion(null)
        setCapture(null)
      } else {
        toast.error(result.message)
      }
    })
  }

  const effectiveType = receiptType === AUTO ? suggestion?.type : receiptType

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scan a receipt</CardTitle>
        <CardDescription>
          Scan a photo or type the receipt in. The category is detected as you
          go — override it any time.
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
              if (next === "manual") setCapture(null)
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
                onChange={setCapture}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                The photo is attached to the receipt. Reading the fields off it
                automatically is not wired up yet, so confirm the details below.
              </p>
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
                aria-invalid={Boolean(state.fieldErrors.tax)}
              />
              <FieldError message={state.fieldErrors.tax} />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="receiptType">Receipt type</Label>

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
              isDetecting={isDetecting}
              suggestion={suggestion}
              isAuto={receiptType === AUTO}
              onAccept={(type) => setReceiptType(type)}
            />

            <FieldError message={state.fieldErrors.receiptType} />
          </div>

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
              {effectiveType ? receiptTypeLabel(effectiveType) : "Other"}
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
      <SparklesIcon className="size-3" />
      <span>Detected</span>
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
