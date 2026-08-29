# connecting the printer

the till prints through the browser. that is a decision, not a gap - see
"why not talk to the printer directly" at the bottom before changing it.

this is for a **network (wi-fi or ethernet) 80mm thermal printer** and the
**android tablet**. if the truck ever moves to a bluetooth or usb printer the
same steps work, only step 3 changes.

---

## the truck's printer

an **Xprinter XP-80T** on ethernet, confirmed working on the network:

| | |
|---|---|
| model | `XP-80T` - the `T` is the ethernet+usb variant (`C` is bluetooth, plain `XP-80` is usb only) |
| serial | `80TBKLU1KF50068` |
| ip | `192.168.8.248` |
| port | `9100` |
| gateway | `192.168.8.1` |
| dhcp | **disabled** - the address is static and will not move |
| config page | `http://192.168.8.248` in any browser on the same network |
| mac | `00-61-42-3D-0B-35` |
| paper | 80mm, 576 dots/line, 200mm/s |
| cutter | **auto cutter, fitted** |
| drawer port | **24V 1A**, on the back |

two of those matter more than they look. **the cutter is real hardware that is
present** - so a sale that comes off the roll uncut is the app not sending the
command, never the printer refusing it. and **the drawer port is wired and
powered**, which is why `Cash Open` on the config page works.

what the XP-80T does *not* have is any of the things android looks for on its
own: **no IPP, no mDNS/bonjour, no AirPrint, no Mopria.** the ethernet port is
there for raw ESC/POS on 9100 and nothing else. android discovers printers by
mDNS, so it will never find this one, and no setting on either device changes
that. it is the whole reason a bridge app exists in this setup at all.

dhcp being off is the good outcome: the printer keeps that address across power
cycles, so nothing has to be reserved on the router. the cost is that it is
pinned to the `192.168.8.x` range - **if the truck ever changes router to one
handing out a different range (192.168.1.x is the common one), the printer
disappears** and the fix is the `Configuration` page above, not the app.

the `192.168.8.1` gateway is the signature of a portable 4G router. if that is
what the truck runs on, the tablet has to be on that router's wi-fi - on mobile
data it cannot see the printer at all.

**the test that needs no app:** open `http://192.168.8.248` and click
**Printer Test** in the blue menu. if a slip comes out, everything from the
tablet to the print head is proven and any remaining problem is the print
service, nothing else.

## what you need

- the printer on the **same network as the tablet**.
- about ten minutes, with the truck closed.

---

## the steps

**1. put the printer on the network.**
ethernet: plug it into the router, that is all. wi-fi: follow the printer's own
leaflet, usually a utility or a WPS button.

**2. get the IP.** the self-test slip above, or the table at the top of this
file. check the tablet is on that same network in `Settings → Wi-Fi`.

**3. install RawBT** from the play store on the tablet, and add the printer:

| field | value |
|---|---|
| ip / host | `192.168.8.248` |
| port | `9100` |
| printer driver | **`ESC/POS general`** |
| paper width | `80mm` (576 dots) |
| cut paper | **after each page** - see below |

xprinter has no android print service of its own, unlike star and bixolon, and
it does not speak IPP - so mopria and android's built-in print service will
never find it. a bridge app is not a workaround here, it is the only route.

press **اختبار / Test** on that screen before saving. if the test passes the
connection is real; if it fails, nothing after this point can work.

**about the cut between the two copies.** each sale prints the customer's copy
and the baker's copy. a thermal printer cuts at the end of a *job*, so sent as
one job the two copies come off the roll joined in one long slip.

the till no longer relies on the app for this: **it sends each copy as its own
print job**, so the end-of-job cut lands between them wherever the app's own cut
setting is buried, or missing. see `src/lib/pos/print-job.ts`. the visible cost
is that the print dialog opens once per copy - two taps on a two-copy sale.

if the app does expose `cut paper` / `after each page`, setting it changes
nothing for the better; leave it alone.

**about the bottom of the slip.** the cutter blade sits about 15mm *downstream*
of the print head, so the paper under the blade has already gone past the head.
cut the moment the last line is printed and the cut lands 15mm short of the end
of the receipt - the bottom of it stays inside the printer and reappears as a
stub on top of the next sale.

the usual fix is `feed lines before cut` in the print-service app. **RawBT has
no such field**, so the till pays for the feed itself: it makes the page longer
than the receipt, and the printer has to wind through the difference before the
job ends.

**and that extra page cannot be blank.** RawBT trims trailing white off a page
before it sends it, so an empty tail is thrown away and the feed goes with it -
which is why raising the number did nothing at all, twice, until the tail was
given something to print. so the receipt now ends in a dashed line 35mm below
the last line of text. the line is sacrificial: the cut lands on or near it, and
whatever survives comes out on top of the next sale, where it reads as the
separator it is.

**the one number is `--receipt-cut-tail` in `src/app/globals.css`.** the block
that fills the tail and the page height in `src/lib/pos/print-page.ts` both read
it, so it cannot be changed in only one of the two places. raise it while the
printer is still cutting inside the receipt; lower it if the stub under the
total gets tiresome. 35mm was arrived at on this printer, not read off a spec.

**4. turn RawBT on as a print service.**
`Settings → Connected devices → Printing → Print services → RawBT → ON`.
on some tablets it is `Settings → search "printing"`. this step is the one
people skip, and without it chrome will not list the printer.

**5. print a real sale.**
open the till in **chrome** on the tablet, ring one sale, press **Print**.
in chrome's dialog change the printer from "Save as PDF" to **RawBT**, and
press print.

---

## checking the first slip

look at these four things on the paper, in this order:

1. **is anything cut off at the right edge?** if yes, the paper width in RawBT
   is not 80mm. fix it there, not in the app.
2. **is the arabic correct?** it should be, because the browser draws it and
   sends a picture. if it comes out as boxes or backwards, RawBT has been put
   in a text/ESC-POS mode instead of a graphics mode - turn the picture/raster
   mode back on.
3. **is the logo clean or muddy?** an 80mm head is one colour of ink at about
   203dpi and the mark is drawn in fine lines. muddy is expected, not broken.
   if it bothers the owner, a bolder solid-fill version of `public/brand/logo.png`
   prints much cleaner and is a one-file swap.
4. **did two slips come out?** the customer copy and the baker copy. one copy
   means chrome printed one page - check the page range in the dialog, and the
   `Receipt copies per sale` setting in `/admin/settings`.

the page size itself is not something you set. the till measures the receipt
just before printing and writes `@page { size: 80mm <height>mm; margin: 0 }`,
so the page ends a blade's distance past the end of the receipt and no further.
that is what stops the roll feeding a hand's width of blank paper after every
sale, while still leaving enough tail for the cut to land clear of the last
line.

---

## the cut and the cash drawer

RawBT on the truck's tablet has **no cut setting and no drawer setting** - the
printer profile ends at the driver list, and there is no xprinter entry in it
(`ESC/POS general` is correct and should be left alone; everything else on that
list is a label language or a pocket-printer protocol).

so both have to be sent as commands. a printed page cannot carry one, but RawBT
takes a job a second way: an `intent:` link carrying base64 ESC/POS, which it
hands to the printer unaltered. that is not blocked by the https→http rule
below, because it is a link handed to an app on the same device rather than a
request to an address.

`/admin/settings` has two links that do exactly this - **Open the cash drawer**
and **Feed and cut**. tap them on the tablet, standing at the printer:

- **both work** → the channel is open. the drawer can then move onto the sale
  itself, and the cut can stop depending on where the page ends.
- **neither works** → RawBT's link entry is not available in this build, and no
  amount of code on the till changes that. the honest answers left are the
  printer's own web page (`Cash Open`, `Cutter Paper` - manual, but it works
  today) or the local bridge described at the bottom of this file.

the bytes are in `src/lib/pos/rawbt.ts`: `ESC p 0 25 250` for the drawer,
`ESC d 4` + `GS V 66 0` for a feed and a partial cut. they are android and
chrome only - on a desktop the links do nothing, which is not a fault.

## the two things this setup does not do

**it does not open the cash drawer.** the drawer is wired into the printer's
RJ11 socket and opens when the printer is sent an ESC/POS pulse. going through
android's print framework we send a picture, not commands, so no pulse.

worth knowing though: this printer's own config page has a **Cash Open** button
next to Printer Test, so the drawer can be pulsed over the network without any
esc/pos work of ours. that makes wiring the drawer to a cash sale a smaller job
than it first looks - the obstacle is not the printer, it is that an https page
cannot reach an http address, which is the next section.

**it is not silent.** chrome's print dialog appears on every sale and somebody
taps once more. on a busy window that is a second per customer.

---

## why not talk to the printer directly

it is the obvious idea and it is worth writing down why it was not taken, so
nobody spends a week rediscovering it:

- **https cannot call http.** the till is served over https from vercel. the
  printer answers on `http://192.168.x.x:9100`. browsers block that outright as
  mixed content. serving the till over plain http on the truck's lan would fix
  it and break the offline mode, because service workers need https.
- **arabic.** ESC/POS prints text from the printer's own character tables. most
  cheap 80mm units have no arabic table, or have one that renders letters
  unjoined and in the wrong order. `شكراً`, a customer's name, an arabic tax
  label - all of it is at risk. the browser has none of that problem.
- **the logo** would have to be converted to a 1-bit raster and sent as an
  image command anyway.

if silent printing and the cash drawer are ever worth the work, the answer is
**not** ESC/POS text. it is to render the existing receipt to a canvas, send
that bitmap as an ESC/POS raster, and append the drawer pulse - arabic and logo
survive because they are still drawn by the browser. that needs a small local
bridge on the network (the printer will not accept a connection from an https
page), so it is a real project, not an afternoon.
