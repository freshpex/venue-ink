import { useState } from 'react';
import { useApi, dateTime } from '../../lib/queries';
import { request } from '../../lib/api';
import { Loading, Failure } from '../../components/AsyncState';
import { Button } from '../../components/ui/button';
import { SaveForm, str, checked, options } from './Forms';
import type { User, ArticleData, SupportRequest } from '../../lib/types';
import manifest from '../../data/image-manifest.json';
export function UsersPanel() {
  const [search, setSearch] = useState('');
  const query = useApi<{ users: (User & { active: boolean })[] }>(
    '/admin/users?search=' + encodeURIComponent(search),
  );
  return (
    <section className="workspace-card">
      <h2>The people in Venue.</h2>
      <label className="search-field">
        <input
          aria-label="Search accounts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a name or email"
        />
      </label>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <Failure message={query.error.message} />
      ) : (
        query.data.users.map((user) => (
          <details className="entity-details" key={user.id}>
            <summary>
              <strong>{user.name}</strong>
              <span>
                {user.email} · {user.role} · {user.active ? 'Active' : 'Restricted'}
              </span>
            </summary>
            <SaveForm
              fields={[
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
                    role: str(data, 'role'),
                    active: checked(data, 'active'),
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
  const query = useApi<{
    entries: {
      id: string;
      actor_name: string;
      action: string;
      entity_id: string;
      created_at: string;
    }[];
  }>('/admin/audit');
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
                {item.actor_name} · {item.entity_id}
              </small>
            </span>
            <time>{dateTime(item.created_at)}</time>
          </div>
        ))
      )}
    </section>
  );
}
