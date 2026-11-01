import { frontMatter } from 'markdown-it-sketch';
import spec from '../../../spec/spec.md?raw';

export interface Example {
  id: string;
  title: string;
  source: string;
  /** Base URL for `::src` links, such as a GitHub blob URL at a commit. */
  srcBase?: string;
  /** Loaded from `local-examples/`, which is gitignored. */
  local?: boolean;
}

/**
 * Private examples: Markdown files in `apps/playground/local-examples/`, which is gitignored.
 * Optional front matter sets the menu title and the source link base:
 *   ---
 *   title: ovia 6b8da71
 *   srcBase: https://github.com/org/repo/blob/<sha>/
 *   ---
 */
const localFiles = import.meta.glob<string>('../local-examples/*.md', { query: '?raw', import: 'default', eager: true });

function localExample(path: string, raw: string): Example {
  const name = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
  const { data, body } = frontMatter(raw);
  return {
    id: `local:${name}`,
    title: data.title || name,
    source: body,
    srcBase: data.srcBase || undefined,
    local: true,
  };
}

const refreshToken = `refresh_token(account_id):                      ::src[auth/tokens.py:40-78]
    Only one refresh at a time per account.
    take the refresh lock                         ::lock:token-refresh ::write:redis[30 s ttl]
    token = load_token(account_id)                ::read:postgres.tokens[lookup by key] ::secret:token
    if token expires in more than 5 minutes:      ::src[45-47]
        release the lock                          ::write:redis
        return token
    fresh = oauth.refresh(token.refresh_token)    ::write:google[rotates the refresh token] ::secret:fresh ::src[49]
    if that fails:                                ::src[50-55]
        release the lock                          ::write:redis
        if the provider says the grant is gone:
            ::fail:Revoked
    save_token(account_id, fresh)                 ::write:postgres.tokens[!no retry]
    publish token-rotated event                   ::write~:kafka.token-rotated ::unsure[may be async]
    audit(account_id, fresh)                      ::write:logs ::danger[secret reaches the audit log]
    warm the session cache                        ::write?:redis
    release the lock                              ::write:redis
    return fresh                                  ::todo[ask about clock skew]
    ::src:load_token[auth/store.py:12]
    ::src:oauth.refresh[auth/oauth.py:88-120]
`;

const getProfile = `get_profile(user_id):                    ::src[app/profile.py:12-24]
    cached = cache.get(user_id)          ::read:redis[lookup by key] ::src[13]
    if cached:
        return cached
    else:                                ::src[16-23]
        row = load_user(user_id)         ::read:postgres.users[lookup by key]
        if no row:
            ::fail:NotFound
        cache.set(user_id, row)          ::write:redis[5 min ttl]
        return row
    ::src:load_user[app/users.py:88]
    ::src:cache.set[lib/cache.py:31]
`;

const signup = `signup(request):
    body = request.json()                 ::untrusted:body
    if body.email is malformed:
        ::fail:InvalidEmail
    user = get_or_create(body.email)      ::write?:postgres.users
    if user is verified:
        ::fail:AlreadyExists
    hash = bcrypt(body.password)          ::secret:hash
    set_password(user, hash)              ::write:postgres.users
    send_verification(user)               ::write:sendgrid
    log_event("signup", body)             ::write:logs
`;

const searchOrders = `search_orders(user_id, term):
    user = get_user(user_id)          ::read:postgres.users[lookup by key]
    orders = recent_orders(user)      ::read:postgres.orders[range on created_at]
    if a term is given:
        filter orders by note text    ::read:postgres.orders[!full scan]
    for each order:
        items = get_items(order.id)   ::read:postgres.items[!n x lookup by key]
    count orders by status            ::read:postgres.orders[!full scan, probably]
`;

const bookTrip = `book_trip(trip, card):
    seat = hold_seat(trip.flight)           ::write:airline-api
    room = reserve_room(trip.hotel)         ::write:hotel-api
    if that fails:
        release_seat(seat)                  ::write:airline-api
        ::fail:BookingFailed
    charge(card, trip.total)                ::write:stripe
    if that fails:
        cancel_room(room)                   ::write:hotel-api
        release_seat(seat)                  ::write:airline-api
        ::fail:PaymentFailed
    save_booking(trip, seat, room)          ::write:postgres.bookings
`;

const runAgent = `run_agent(task):
    messages = [task]
    repeat up to 20 turns:
        reply = claude.create(messages, tools)  ::read:anthropic
        if no tool calls, return reply.text
        for each tool call, in parallel:
            run_tool(call)                      ::write:*
        append results to messages
    ::fail:TooManyTurns
`;

const cancelOrder = `cancel_order(order_id):
    order = load_order(order_id)            ::read:postgres.orders[lookup by key]
    if order is shipped:
        ::fail:AlreadyShipped
    refund_id = refund(order.payment)       ::write:stripe ::new
    if that fails:                          ::new
        ::fail:RefundFailed
    mark order cancelled, with refund_id    ::write:postgres.orders ::changed[was deleted]
    email the customer                      ::write:sendgrid ::removed
`;

const realCode = `load_config(path):
    Real code stays plain: only tags after whitespace are markers.
    text = std::fs::read_to_string(&path)   ::read:fs ::untrusted:text
    defaults = Vec::new()
    paths = [path, "~/.config/app.toml"]
    if !text.is_empty():
        cfg = toml::from_str(&text)
        if that fails:
            ::fail:InvalidConfig
    $user->save()                           ::write:postgres.users ::unsure[only in legacy mode?]
    stream it to the mirror                 ::read:s3.configs ::write:gcs.configs
`;

const prComment = `### Review: \`book_trip\` after #482

The new payment step looks right, but one write has no failure path:

\`\`\`sketch
book_trip(trip, card):
    seat = hold_seat(trip.flight)           ::write:airline-api
    room = reserve_room(trip.hotel)         ::write:hotel-api
    if that fails:
        release_seat(seat)                  ::write:airline-api
        ::fail:BookingFailed
    charge(card, trip.total)                ::write:stripe[!no idempotency key]
    if that fails:
        cancel_room(room)                   ::write:hotel-api
        release_seat(seat)                  ::write:airline-api
        ::fail:PaymentFailed
    save_booking(trip, seat, room)          ::write:postgres.bookings
\`\`\`

1. If \`save_booking\` fails after the charge, the customer pays and gets no booking.
2. The \`::write:stripe[!no idempotency key]\` call can double-charge on retry.

Suggested shape:

\`\`\`sketch
    save_booking(trip, seat, room)          ::write:postgres.bookings
    if that fails:
        refund(card, trip.total)            ::write:stripe
        ::fail:BookingFailed
\`\`\`
`;

export const examples: Example[] = [
  { id: 'refresh-token', title: 'Every marker (refresh_token)', source: refreshToken },
  { id: 'get-profile', title: 'Source links (get_profile)', source: getProfile },
  { id: 'signup', title: 'Labels and conditional writes (signup)', source: signup },
  { id: 'search-orders', title: 'Access patterns (search_orders)', source: searchOrders },
  { id: 'book-trip', title: 'Failure blocks (book_trip)', source: bookTrip },
  { id: 'run-agent', title: 'Runtime effects (run_agent)', source: runAgent },
  { id: 'cancel-order', title: 'A change (cancel_order)', source: cancelOrder },
  { id: 'real-code', title: 'Real code stays plain (load_config)', source: realCode },
  { id: 'pr-comment', title: 'Markdown: a review comment', source: prComment },
  { id: 'spec', title: 'Markdown: the spec itself', source: spec },
  ...Object.entries(localFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, raw]) => localExample(path, raw)),
];
