import {
  BellIcon, CalculatorIcon, CalendarIcon, CircleAlertIcon, GitBranchIcon, HashIcon, HeartIcon, HourglassIcon, KeyRoundIcon, LayersIcon,
  ListOrderedIcon, ShoppingCartIcon, SparklesIcon, TextCursorInputIcon, TypeIcon,
  type LucideIcon,
} from 'lucide-react'

/** A starting point: a message that already parses, so an author edits words instead of syntax. */
export type Template = { name: string; description: string; pattern: string }

/** One line per arm, the way a person would lay a choice out by hand. */
const l = (...lines: string[]) => lines.join('\n')

/**
 * Written in English and complete for it: every plural carries what English CLDR asks. A locale
 * that needs more forms says so in the editor the moment one is inserted. Lists and rich-text tags
 * are not here because the §6 profile has neither.
 */
export const library: { name: string; icon: LucideIcon; templates: Template[] }[] = [
  {
    name: 'Basics',
    icon: TypeIcon,
    templates: [
      { name: 'Greeting', description: 'A name in a sentence', pattern: 'Hello, {name}!' },
      { name: 'Welcome back', description: 'A name and a date', pattern: 'Welcome back, {name}. Your last visit was on {lastVisit, date, ::yMMMd}.' },
      { name: 'Possessive', description: 'An apostrophe after a name', pattern: "{name}'s workspace" },
      { name: 'Signed in as', description: 'An address, printed as is', pattern: 'Signed in as {email}' },
    ],
  },
  {
    name: 'Plurals',
    icon: HashIcon,
    templates: [
      { name: 'Item count', description: 'None, one, many', pattern: l('{count, plural,', '  =0 {No items}', '  one {# item}', '  other {# items}', '}') },
      {
        name: 'Unread messages',
        description: 'A count inside a sentence',
        pattern: l('You have {count, plural,', '  =0 {no unread messages}', '  one {# unread message}', '  other {# unread messages}', '}.'),
      },
      {
        name: 'Files selected',
        description: 'A selection count',
        pattern: l('{count, plural,', '  =0 {No files selected}', '  one {# file selected}', '  other {# files selected}', '}'),
      },
      {
        name: 'Search results',
        description: 'A count and the query',
        pattern: l('{count, plural,', '  =0 {No results for “{query}”}', '  one {# result for “{query}”}', '  other {# results for “{query}”}', '}'),
      },
      { name: 'Seats left', description: 'Scarcity wording', pattern: l('{seats, plural,', '  one {Only # seat left}', '  other {# seats left}', '}') },
    ],
  },
  {
    name: 'Select',
    icon: GitBranchIcon,
    templates: [
      {
        name: 'Gendered reply',
        description: 'One sentence per gender',
        pattern: l('{gender, select,', '  female {She replied}', '  male {He replied}', '  other {They replied}', '} to your comment.'),
      },
      { name: 'On or off', description: 'A yes or no switch', pattern: l('Notifications are {enabled, select,', '  true {on}', '  false {off}', '  other {unavailable}', '}.') },
      {
        name: 'Role',
        description: 'What a member may do',
        pattern: l(
          '{role, select,',
          '  owner {You own this project}',
          '  admin {You manage this project}',
          '  member {You are a member of this project}',
          '  other {You have access to this project}',
          '}',
        ),
      },
      {
        name: 'Plan badge',
        description: 'A label per plan',
        pattern: l('{plan, select,', '  free {Free plan}', '  pro {Pro plan}', '  team {Team plan}', '  other {Custom plan}', '}'),
      },
    ],
  },
  {
    name: 'Ordinals',
    icon: ListOrderedIcon,
    templates: [
      { name: 'Ranking', description: '1st, 2nd, 3rd…', pattern: l('You finished {place, selectordinal,', '  one {#st}', '  two {#nd}', '  few {#rd}', '  other {#th}', '}.') },
      {
        name: 'Anniversary',
        description: 'An ordinal inside a sentence',
        pattern: l('Happy {years, selectordinal,', '  one {#st}', '  two {#nd}', '  few {#rd}', '  other {#th}', '} anniversary!'),
      },
      {
        name: 'Attempt',
        description: 'Which try this is',
        pattern: l('This is your {attempt, selectordinal,', '  one {#st}', '  two {#nd}', '  few {#rd}', '  other {#th}', '} attempt.'),
      },
    ],
  },
  {
    name: 'Nested',
    icon: LayersIcon,
    templates: [
      {
        name: 'Who added photos',
        description: 'A count inside each gender',
        pattern: l(
          '{gender, select,',
          '  female {{count, plural,',
          '    one {She added # photo}',
          '    other {She added # photos}',
          '  }}',
          '  male {{count, plural,',
          '    one {He added # photo}',
          '    other {He added # photos}',
          '  }}',
          '  other {{count, plural,',
          '    one {They added # photo}',
          '    other {They added # photos}',
          '  }}',
          '}',
        ),
      },
      {
        name: 'Likes with offset',
        description: 'Someone and N others',
        pattern: l(
          '{count, plural, offset:1',
          '  =0 {Nobody liked this yet}',
          '  =1 {{name} liked this}',
          '  one {{name} and # other liked this}',
          '  other {{name} and # others liked this}',
          '}',
        ),
      },
      {
        name: 'Paid items',
        description: 'A count inside each state',
        pattern: l(
          '{status, select,',
          '  paid {{count, plural,',
          '    one {Your item is paid and ready}',
          '    other {Your # items are paid and ready}',
          '  }}',
          '  other {{count, plural,',
          '    one {Your item is waiting for payment}',
          '    other {Your # items are waiting for payment}',
          '  }}',
          '}',
        ),
      },
    ],
  },
  {
    name: 'Numbers',
    icon: CalculatorIcon,
    templates: [
      { name: 'Price', description: 'A currency amount', pattern: 'Total: {amount, number, ::currency/EUR}' },
      { name: 'Progress', description: 'A percentage', pattern: '{ratio, number, ::percent} complete' },
      { name: 'Discount', description: 'A percentage off', pattern: 'Save {discount, number, ::percent} today' },
      { name: 'Views', description: 'A short compact number', pattern: '{views, number, ::compact-short} views' },
      { name: 'Distance', description: 'One decimal and a unit', pattern: '{distance, number, ::unit/kilometer unit-width-short .0} away' },
      { name: 'Storage', description: 'Used out of a limit', pattern: '{used, number, ::unit/gigabyte unit-width-short} of {limit, number, ::unit/gigabyte unit-width-short} used' },
    ],
  },
  {
    name: 'Dates & Time',
    icon: CalendarIcon,
    templates: [
      { name: 'Due date', description: 'A short date', pattern: 'Due {due, date, ::yMMMd}' },
      { name: 'Event start', description: 'Weekday, date and time', pattern: 'Starts {start, date, ::EEEEMMMMd} at {start, time, ::Hm}' },
      { name: 'Last seen', description: 'A date and the local clock', pattern: 'Last seen {seen, date, ::MMMd} at {seen, time, ::jm}' },
      { name: 'Invoice period', description: 'Month and year', pattern: 'Invoice for {period, date, ::MMMMy}' },
      { name: 'Full date', description: 'Everything spelled out', pattern: '{day, date, ::EEEEMMMMdy}' },
    ],
  },
  {
    name: 'Time & Duration',
    icon: HourglassIcon,
    templates: [
      { name: 'Minutes ago', description: 'Just now, then counted', pattern: l('{minutes, plural,', '  =0 {Just now}', '  one {# minute ago}', '  other {# minutes ago}', '}') },
      { name: 'Hours left', description: 'A countdown', pattern: l('{hours, plural,', '  one {# hour left}', '  other {# hours left}', '}') },
      { name: 'Reading time', description: 'Minutes to read', pattern: l('{minutes, plural,', '  one {# min read}', '  other {# min read}', '}') },
      {
        name: 'Starts in',
        description: 'Less than a day, or days',
        pattern: l('Starts in {days, plural,', '  =0 {less than a day}', '  one {# day}', '  other {# days}', '}'),
      },
      {
        name: 'Trial ending',
        description: 'Exact days before the general case',
        pattern: l('{days, plural,', '  =0 {Your trial ends today}', '  one {Your trial ends tomorrow}', '  other {Your trial ends in # days}', '}'),
      },
    ],
  },
  {
    name: 'E-commerce',
    icon: ShoppingCartIcon,
    templates: [
      {
        name: 'Cart summary',
        description: 'Items and a total',
        pattern: l('{count, plural,', '  =0 {Your cart is empty}', '  one {# item · {total, number, ::currency/EUR}}', '  other {# items · {total, number, ::currency/EUR}}', '}'),
      },
      { name: 'Stock level', description: 'Out, low, available', pattern: l('{stock, plural,', '  =0 {Out of stock}', '  one {Only # left}', '  other {# in stock}', '}') },
      {
        name: 'Free shipping',
        description: 'Reached, or how much is missing',
        pattern: l('{qualifies, select,', '  true {You get free shipping!}', '  other {Add {remaining, number, ::currency/EUR} more for free shipping}', '}'),
      },
      {
        name: 'Order status',
        description: 'One line per state',
        pattern: l(
          '{status, select,',
          '  shipped {Your order is on its way}',
          '  delivered {Your order arrived on {date, date, ::yMMMd}}',
          '  cancelled {Your order was cancelled}',
          '  other {We are preparing your order}',
          '}',
        ),
      },
      { name: 'Delivery estimate', description: 'A weekday and a date', pattern: 'Arrives {date, date, ::EEEMMMd}' },
      {
        name: 'Unit price',
        description: 'A price per unit',
        pattern: l('{price, number, ::currency/EUR} per {unit, select,', '  kg {kilo}', '  l {litre}', '  other {item}', '}'),
      },
    ],
  },
  {
    name: 'Notifications',
    icon: BellIcon,
    templates: [
      { name: 'Mentions', description: 'Who, how often, where', pattern: l('{name} mentioned you {count, plural,', '  one {once}', '  other {# times}', '} in {channel}') },
      { name: 'New messages', description: 'From one sender', pattern: l('{sender} sent you {count, plural,', '  one {a message}', '  other {# messages}', '}') },
      {
        name: 'Reminder',
        description: 'Now, or in minutes',
        pattern: l('Reminder: {event} starts {minutes, plural,', '  =0 {now}', '  one {in # minute}', '  other {in # minutes}', '}'),
      },
      {
        name: 'Updates',
        description: 'Up to date, or how many',
        pattern: l("{count, plural,", "  =0 {You're up to date}", '  one {# update available}', '  other {# updates available}', '}'),
      },
      {
        name: 'Weekly digest',
        description: 'Nothing new, or a count',
        pattern: l('Your weekly digest: {count, plural,', '  =0 {nothing new}', '  one {# new post}', '  other {# new posts}', '}'),
      },
    ],
  },
  {
    name: 'Social',
    icon: HeartIcon,
    templates: [
      {
        name: 'Followers',
        description: 'Compact once it grows',
        pattern: l('{count, plural,', '  =0 {No followers yet}', '  one {# follower}', '  other {{count, number, ::compact-short} followers}', '}'),
      },
      {
        name: 'Comments',
        description: 'An invitation when there are none',
        pattern: l('{count, plural,', '  =0 {Be the first to comment}', '  one {# comment}', '  other {# comments}', '}'),
      },
      { name: 'Shared with you', description: 'Who shared how many', pattern: l('{name} shared {count, plural,', '  one {a photo}', '  other {# photos}', '} with you') },
      {
        name: 'Friends in common',
        description: 'None, one, many',
        pattern: l('{count, plural,', '  =0 {No friends in common}', '  one {# friend in common}', '  other {# friends in common}', '}'),
      },
    ],
  },
  {
    name: 'Forms',
    icon: TextCursorInputIcon,
    templates: [
      { name: 'Required field', description: 'A field name', pattern: '{field} is required.' },
      { name: 'Minimum length', description: 'At least N characters', pattern: l('Use at least {min, plural,', '  one {# character}', '  other {# characters}', '}.') },
      {
        name: 'Characters left',
        description: 'A counter under a field',
        pattern: l('{remaining, plural,', '  =0 {No characters left}', '  one {# character left}', '  other {# characters left}', '}'),
      },
      { name: 'File too large', description: 'A name and a limit', pattern: '{name} is larger than {max, number, ::unit/megabyte unit-width-short}.' },
      {
        name: 'Errors to fix',
        description: 'Before a form submits',
        pattern: l('{count, plural,', '  one {Fix # error before continuing.}', '  other {Fix # errors before continuing.}', '}'),
      },
    ],
  },
  {
    name: 'Account',
    icon: KeyRoundIcon,
    templates: [
      {
        name: 'Password expiry',
        description: 'Today, tomorrow, in days',
        pattern: l('Your password expires {days, plural,', '  =0 {today}', '  one {tomorrow}', '  other {in # days}', '}.'),
      },
      { name: 'Signed-in devices', description: 'A device count', pattern: l('You are signed in on {count, plural,', '  one {# device}', '  other {# devices}', '}.') },
      {
        name: 'Verification code',
        description: 'An address and an expiry',
        pattern: l('We sent a code to {email}. It expires in {minutes, plural,', '  one {# minute}', '  other {# minutes}', '}.'),
      },
      { name: 'Team invitation', description: 'Who invited you where', pattern: '{inviter} invited you to join {team}.' },
    ],
  },
  {
    name: 'Status & Errors',
    icon: CircleAlertIcon,
    templates: [
      {
        name: 'Upload',
        description: 'One line per state',
        pattern: l(
          '{status, select,',
          '  uploading {Uploading {name}…}',
          '  done {{name} uploaded}',
          '  failed {{name} could not be uploaded}',
          '  other {{name} is queued}',
          '}',
        ),
      },
      {
        name: 'Retrying',
        description: 'A countdown after a failure',
        pattern: l('Something went wrong. Retrying in {seconds, plural,', '  one {# second}', '  other {# seconds}', '}…'),
      },
      {
        name: 'Saving',
        description: 'Saved, or how many are pending',
        pattern: l('{pending, plural,', '  =0 {All changes saved}', '  one {Saving # change…}', '  other {Saving # changes…}', '}'),
      },
    ],
  },
  {
    name: 'Real world',
    icon: SparklesIcon,
    templates: [
      {
        name: 'Order summary',
        description: 'Name, count, total and state',
        pattern: l(
          '{name}, your order of {count, plural,',
          '  one {# item}',
          '  other {# items}',
          '} for {total, number, ::currency/EUR} {status, select,',
          '  shipped {is on its way}',
          '  delivered {has arrived}',
          '  other {is being prepared}',
          '}.',
        ),
      },
      {
        name: 'Going with guests',
        description: 'Gender, then a guest count',
        pattern: l(
          '{gender, select,',
          '  female {{guests, plural,',
          '    =0 {She is going alone}',
          '    one {She is going with # guest}',
          '    other {She is going with # guests}',
          '  }}',
          '  male {{guests, plural,',
          '    =0 {He is going alone}',
          '    one {He is going with # guest}',
          '    other {He is going with # guests}',
          '  }}',
          '  other {{guests, plural,',
          '    =0 {They are going alone}',
          '    one {They are going with # guest}',
          '    other {They are going with # guests}',
          '  }}',
          '}',
        ),
      },
      {
        name: 'Subscription',
        description: 'Free, or renewal date and price',
        pattern: l(
          '{plan, select,',
          '  free {You are on the free plan.}',
          '  other {Your plan renews on {renewal, date, ::yMMMd} for {price, number, ::currency/EUR}.}',
          '}',
        ),
      },
    ],
  },
]
