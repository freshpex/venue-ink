import { Pagination } from './OperationsPanel';
import type { PageData } from './OperationsPanel';
import { useState } from 'react';
import { useApi, dateTime } from '../../lib/queries';
import { request } from '../../lib/api';
import { Loading, Failure } from '../../components/AsyncState';
import { Button } from '../../components/ui/button';
import { SaveForm, str, checked, options } from './Forms';
import { Link } from 'react-router-dom';
import type { ProfileData } from './AccountPanel';
import type { User, ArticleData, SupportRequest } from '../../lib/types';
import manifest from '../../data/image-manifest.json';
export function UsersPanel() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);
  const [createRole, setCreateRole] = useState('client');
  const [created, setCreated] = useState('');
  const profile = useApi<ProfileData>('/profile');
  const query = useApi<{ users: (User & { active: boolean })[]; pagination: PageData }>(
    '/admin/users?' +
      new URLSearchParams({ search, page: String(page), ...(role !== 'all' ? { role } : {}) }),
  );
  return (
    <section className="workspace-card">
      <h2>Accounts & access</h2>
      <p>
        Create clients, artists, studio owners and administrators. New artist profiles start hidden
        until reviewed.
      </p>
      <details className="entity-details">
        <summary>
          <strong>Create an account</strong>
        </summary>
        <label>
          New account role
          <select
            aria-label="New account role"
            value={createRole}
            onChange={(e) => setCreateRole(e.target.value)}
          >
            {['client', 'artist', 'studio', 'admin'].map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <SaveForm
          key={createRole + created}
          label="Create account"
          fields={[
            { name: 'name', label: 'Full name', required: true },
            { name: 'email', label: 'Email address', type: 'email', required: true },
            {
              name: 'password',
              label: 'Initial password',
              type: 'password',
              required: true,
              hint: 'Share privately with the account owner. They can change it in My account.',
            },
            ...(createRole === 'artist'
              ? [
                  {
                    name: 'studioId',
                    label: 'Existing studio',
                    type: 'select' as const,
                    options: [
                      { value: '', label: 'Create a new studio' },
                      ...(profile.data?.studios.map((s) => ({ value: s.id, label: s.name })) || []),
                    ],
                  },
                ]
              : []),
            ...(['artist', 'studio'].includes(createRole)
              ? [
                  {
                    name: 'studioName',
                    label: 'New studio name',
                    hint: 'Leave empty to use the account name followed by Studio. Leave empty when joining an existing studio.',
                  },
                ]
              : []),
          ]}
          onSave={async (data) => {
            const result = await request<{ user: User }>('/admin/users', {
              method: 'POST',
              body: JSON.stringify({
                name: str(data, 'name'),
                email: str(data, 'email'),
                password: String(data.get('password') || ''),
                role: createRole,
                ...(str(data, 'studioId') ? { studioId: str(data, 'studioId') } : {}),
                ...(str(data, 'studioName') ? { studioName: str(data, 'studioName') } : {}),
              }),
            });
            setCreated(result.user.name);
          }}
        />
      </details>
      {created && <p role="status">Created {created}. The account owner can now sign in.</p>}
      <label>
        Filter by role
        <select
          aria-label="Filter by role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          {['all', 'client', 'artist', 'studio', 'admin'].map((r) => (
            <option key={r} value={r}>
              {r === 'all' ? 'All roles' : r}
            </option>
          ))}
        </select>
      </label>
      <label className="search-field">
        <input
          aria-label="Search accounts"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Find a name or email"
        />
      </label>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure message={query.error.message} />
      ) : (
        query.data.users
          .filter((user) => role === 'all' || user.role === role)
          .map((user) => (
            <details className="entity-details" key={user.id}>
              <summary>
                <strong>{user.name}</strong>
                <span>
                  {user.email} · {user.role} · {user.active ? 'Active' : 'Restricted'}
                </span>
              </summary>
              <SaveForm
                key={JSON.stringify(user)}
                fields={[
                  { name: 'name', label: 'Account name', value: user.name, required: true },
                  {
                    name: 'role',
                    label: 'Account role',
                    type: 'select',
                    value: user.role,
                    options: options(['client', 'artist', 'studio', 'admin']),
                  },
                  {
                    name: 'active',
                    label: 'Account is active',
                    type: 'checkbox',
                    value: user.active,
                  },
                ]}
                onSave={(data) =>
                  request('/admin/users/' + user.id, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      name: str(data, 'name'),
                      role: str(data, 'role'),
                      active: checked(data, 'active'),
                    }),
                  })
                }
              />
            </details>
          ))
      )}
      <Pagination data={query.data?.pagination} onPage={setPage} />
    </section>
  );
}

export function AdminOverview() {
  const query = useApi<{ overview: Record<string, number> }>('/admin/overview');
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  const o = query.data.overview;
  return (
    <>
      <div className="workspace-stats">
        {[
          ['Accounts', o.users],
          ['Bookings', o.bookings],
          ['Open support', o.open_support],
          ['Payments to verify', o.payment_requests],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <section className="workspace-card">
        <h2>Platform operations</h2>
        <p>
          Manage access, review public profiles and resolve booking, payment and support work across
          Venue.
        </p>
        {[
          [
            'users',
            'Accounts & access',
            'Create any account type and manage roles or restrictions.',
          ],
          ['artists', 'Artists', 'Review public artist names and control booking visibility.'],
          ['studio', 'Studios', 'Manage studio names, locations, time zones and publishing.'],
          [
            'bookings',
            'All bookings',
            'Open client requests, conversations and appointment details.',
          ],
          ['payments', 'Payment verification', 'Record received funds and receipt references.'],
          ['inbox', 'Support inbox', 'Respond to enquiries and track their resolution.'],
        ].map(([tab, title, description]) => (
          <Link className="entity-row" key={tab} to={'/admin?tab=' + tab}>
            <span>
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
            ↗
          </Link>
        ))}
      </section>
    </>
  );
}
export function AdminArtists() {
  const query = useApi<{
    artists: {
      id: string;
      display_name: string;
      email: string;
      studio_name: string;
      active: boolean;
      role: string;
      published: boolean;
      books_open: boolean;
    }[];
  }>('/admin/artists');
  const [search, setSearch] = useState('');
  return (
    <section className="workspace-card">
      <h2>Artist directory</h2>
      <p>
        These public names appear in booking, artist pages and appointment details. Publish only
        reviewed profiles with a real artist name. The studio must also be published, have an active
        service and the artist must set working hours before clients can select a time.
      </p>
      <input
        aria-label="Search artists"
        placeholder="Find an artist or studio"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure message={query.error.message} />
      ) : (
        query.data.artists
          .filter((a) =>
            (a.display_name + ' ' + a.studio_name + ' ' + a.email)
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((a) => (
            <details className="entity-details" key={a.id}>
              <summary>
                <strong>{a.display_name}</strong>
                <span>
                  {a.studio_name} · {a.published ? 'Published' : 'Hidden'} ·{' '}
                  {a.books_open ? 'Books open' : 'Books closed'}
                </span>
              </summary>
              <p>
                {a.email} · {a.active ? a.role : 'Restricted account'}
              </p>
              <SaveForm
                key={JSON.stringify(a)}
                fields={[
                  {
                    name: 'displayName',
                    label: 'Public artist name',
                    value: a.display_name,
                    required: true,
                  },
                  {
                    name: 'published',
                    label: 'Publish artist profile',
                    type: 'checkbox',
                    value: a.published,
                  },
                  {
                    name: 'booksOpen',
                    label: 'Accept booking requests',
                    type: 'checkbox',
                    value: a.books_open,
                  },
                ]}
                onSave={(data) =>
                  request('/admin/artists/' + a.id, {
                    method: 'PATCH',
                    body: JSON.stringify({
                      displayName: str(data, 'displayName'),
                      published: checked(data, 'published'),
                      booksOpen: checked(data, 'booksOpen'),
                    }),
                  })
                }
              />
            </details>
          ))
      )}
    </section>
  );
}

export function SupportPanel({ admin = false }: { admin?: boolean }) {
  const query = useApi<{ requests: SupportRequest[] }>(admin ? '/admin/support' : '/support', {
    interval: 30000,
  });
  return (
    <section className="workspace-card">
      <h2>{admin ? 'The support inbox.' : 'Your support enquiries.'}</h2>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure message={query.error.message} />
      ) : query.data.requests.length ? (
        query.data.requests.map((item) => (
          <details className="entity-details" key={item.id}>
            <summary>
              <strong>
                {item.reference} · {item.category}
              </strong>
              <span>
                {item.status.replace('_', ' ')} · {dateTime(item.created_at)}
              </span>
            </summary>
            {admin && (
              <p>
                {item.name} · {item.email} · {item.studio_name}
              </p>
            )}
            <p className="pre-wrap">{item.message}</p>
            {admin ? (
              <>
                <SaveForm
                  fields={[
                    {
                      name: 'status',
                      label: 'Enquiry status',
                      type: 'select',
                      value: item.status,
                      options: options(['open', 'in_progress', 'resolved']),
                    },
                    {
                      name: 'reply',
                      label: 'Reply in the workspace',
                      type: 'textarea',
                      value: item.reply,
                    },
                  ]}
                  onSave={(data) =>
                    request('/admin/support/' + item.id, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        status: str(data, 'status'),
                        reply: str(data, 'reply'),
                      }),
                    })
                  }
                />
                <a
                  className="arrow-link"
                  href={
                    'mailto:' +
                    item.email +
                    '?subject=' +
                    encodeURIComponent('Venue support · ' + item.reference) +
                    '&body=' +
                    encodeURIComponent(item.reply || 'Hello ' + item.name + ',\n\n')
                  }
                >
                  Open email reply ↗
                </a>
              </>
            ) : item.reply ? (
              <blockquote>{item.reply}</blockquote>
            ) : (
              <p>Waiting for a response.</p>
            )}
          </details>
        ))
      ) : (
        <p>No support enquiries yet.</p>
      )}
    </section>
  );
}
export function ArticlesPanel() {
  const query = useApi<{ articles: ArticleData[] }>('/admin/articles');
  const [selected, setSelected] = useState<ArticleData | null>(null);
  return (
    <div className="workspace-columns">
      <section className="workspace-card">
        <h2>The journal.</h2>
        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <Failure message={query.error.message} />
        ) : (
          query.data.articles.map((a) => (
            <button key={a.id} className="entity-row" onClick={() => setSelected(a)}>
              <span>
                <strong>{a.title}</strong>
                <small>
                  {a.published ? 'Published' : 'Not published'} · {a.category}
                </small>
              </span>
              ↗
            </button>
          ))
        )}
        <Button variant="outline" onClick={() => setSelected(null)}>
          Write an article
        </Button>
      </section>
      <section className="workspace-card">
        <h2>{selected ? 'Edit article' : 'A fresh perspective'}</h2>
        <SaveForm
          key={selected?.id || 'new'}
          fields={[
            { name: 'title', label: 'Title', value: selected?.title, required: true },
            {
              name: 'slug',
              label: 'Page address',
              value: selected?.slug,
              required: true,
              hint: 'Lowercase words separated by hyphens.',
            },
            { name: 'category', label: 'Category', value: selected?.category, required: true },
            {
              name: 'excerpt',
              label: 'Introduction',
              type: 'textarea',
              value: selected?.excerpt,
              required: true,
            },
            {
              name: 'body',
              label: 'Article',
              type: 'textarea',
              value: selected?.body,
              required: true,
              hint: 'Separate paragraphs with an empty line. Begin section headings with ##.',
            },
            {
              name: 'image',
              label: 'Cover photograph',
              type: 'select',
              value: selected?.image_name,
              options: manifest.map((image) => ({ value: image.id, label: image.alt })),
            },
            {
              name: 'author',
              label: 'Author name',
              value: selected?.author_name || 'Venue Editorial',
              required: true,
            },
            {
              name: 'published',
              label: 'Publish this article',
              type: 'checkbox',
              value: selected?.published,
            },
          ]}
          onSave={async (data) => {
            await request('/admin/articles' + (selected ? '/' + selected.id : ''), {
              method: selected ? 'PUT' : 'POST',
              body: JSON.stringify({
                title: str(data, 'title'),
                slug: str(data, 'slug'),
                category: str(data, 'category'),
                excerpt: str(data, 'excerpt'),
                body: str(data, 'body'),
                imageName: str(data, 'image'),
                authorName: str(data, 'author'),
                published: checked(data, 'published'),
              }),
            });
            setSelected(null);
          }}
        />
      </section>
    </div>
  );
}
export function SiteSettings() {
  const query = useApi<{
    settings: {
      brand_name: string;
      payment_email: string;
      timezone: string;
      booking_notice: string;
    };
  }>('/admin/settings');
  if (query.isPending) return <Loading />;
  if (query.isError) return <Failure message={query.error.message} />;
  const s = query.data.settings;
  return (
    <section className="workspace-card">
      <h2>The platform details.</h2>
      <SaveForm
        fields={[
          { name: 'brand', label: 'Platform name', value: s.brand_name, required: true },
          {
            name: 'email',
            label: 'Payment enquiry email',
            type: 'email',
            value: s.payment_email,
            required: true,
          },
          { name: 'timezone', label: 'Default time zone', value: s.timezone, required: true },
          {
            name: 'notice',
            label: 'Booking notice',
            type: 'textarea',
            value: s.booking_notice,
            required: true,
          },
        ]}
        onSave={(data) =>
          request('/admin/settings', {
            method: 'PUT',
            body: JSON.stringify({
              brandName: str(data, 'brand'),
              paymentEmail: str(data, 'email'),
              currency: 'USD',
              timezone: str(data, 'timezone'),
              bookingNotice: str(data, 'notice'),
            }),
          })
        }
      />
    </section>
  );
}
export function AuditPanel() {
  const [page, setPage] = useState(1);
  const query = useApi<{
    pagination: PageData;
    entries: {
      id: string;
      actor_name: string;
      action: string;
      entity_name: string;
      created_at: string;
    }[];
  }>('/admin/audit?page=' + page);
  return (
    <section className="workspace-card">
      <h2>Accountability, in order.</h2>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure message={query.error.message} />
      ) : (
        query.data.entries.map((item) => (
          <div className="entity-row" key={item.id}>
            <span>
              <strong>{item.action.replaceAll('.', ' ')}</strong>
              <small>
                {item.actor_name} · {item.entity_name}
              </small>
            </span>
            <time>{dateTime(item.created_at)}</time>
          </div>
        ))
      )}
      <Pagination data={query.data?.pagination} onPage={setPage} />
    </section>
  );
}
