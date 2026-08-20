import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { HubPublicView, HubCaptureForm, HubBookingWizard } from '@/components/smart-hub';
import { usePublicSmartHub } from '@/hooks/useSmartHub';
import {
  AnalyticsService,
  isReservedSlug,
  buildDestinationUrl,
  resolveClickAction,
  mergeCaptureConfig,
} from '@/services/smartHub';
import type { SmartHubButton } from '@/types/smartHub';
import NotFound from '@/pages/NotFound';

function usePublicSeo(opts: {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  favicon?: string | null;
  url?: string;
  updatedAt?: string | null;
}) {
  useEffect(() => {
    const prevTitle = document.title;
    const title = opts.title || 'Smart Hub';
    document.title = title;

    const ensureMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    const ensureLink = (rel: string, href: string) => {
      let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement('link');
        el.rel = rel;
        document.head.appendChild(el);
      }
      el.href = href;
    };

    const description = opts.description || '';
    if (description) {
      ensureMeta('name', 'description', description);
      ensureMeta('property', 'og:description', description);
      ensureMeta('name', 'twitter:description', description);
    }

    ensureMeta('property', 'og:title', title);
    ensureMeta('property', 'og:type', 'website');
    ensureMeta('name', 'twitter:card', opts.image ? 'summary_large_image' : 'summary');
    ensureMeta('name', 'twitter:title', title);
    ensureMeta('name', 'robots', 'index,follow');

    if (opts.url) {
      ensureMeta('property', 'og:url', opts.url);
      ensureLink('canonical', opts.url);
    }

    if (opts.image) {
      const bust = opts.updatedAt ? `?v=${encodeURIComponent(opts.updatedAt)}` : '';
      const imageUrl = opts.image.includes('?') ? opts.image : `${opts.image}${bust}`;
      ensureMeta('property', 'og:image', imageUrl);
      ensureMeta('name', 'twitter:image', imageUrl);
    }

    if (opts.favicon) {
      ensureLink('icon', opts.favicon);
    }

    return () => {
      document.title = prevTitle;
    };
  }, [opts.title, opts.description, opts.image, opts.favicon, opts.url, opts.updatedAt]);
}

export default function PublicSmartHub() {
  const { slug } = useParams<{ slug: string }>();

  if (slug && isReservedSlug(slug)) {
    return <NotFound />;
  }

  return <PublicSmartHubContent slug={slug} />;
}

function PublicSmartHubContent({ slug }: { slug?: string }) {
  const { data, isLoading, error } = usePublicSmartHub(slug);
  const hub = data?.hub;
  const [formOpen, setFormOpen] = useState(false);
  const [formButton, setFormButton] = useState<SmartHubButton | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingButton, setBookingButton] = useState<SmartHubButton | null>(null);

  const seoTitle = hub?.seo_title || hub?.title;
  const seoDescription = hub?.seo_description || hub?.description;
  const seoImage = hub?.banner_url || hub?.profile_url || hub?.logo_url;

  usePublicSeo({
    title: seoTitle,
    description: seoDescription,
    image: seoImage,
    favicon: hub?.favicon_url || hub?.logo_url || hub?.profile_url,
    url: typeof window !== 'undefined' ? window.location.href.split('?')[0] : undefined,
    updatedAt: hub?.updated_at,
  });

  useEffect(() => {
    if (!hub?.id) return;
    AnalyticsService.trackVisit(hub.id, {
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
      device_type: window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
    }).catch(() => {
      /* tracking best-effort */
    });
  }, [hub?.id]);

  const openForm = (button?: SmartHubButton | null) => {
    setFormButton(button || null);
    setFormOpen(true);
    if (hub?.id) {
      AnalyticsService.trackClick(hub.id, button?.id?.startsWith('hub-') ? null : button?.id || null, {
        target_url: 'form:open',
        button_title: button?.title || 'Formulário',
        button_type: 'form',
        visual_variant: button?.visual_variant || 'simple',
        device_type:
          window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
      }).catch(() => undefined);
    }
  };

  const openBooking = (button?: SmartHubButton | null) => {
    setBookingButton(button || null);
    setBookingOpen(true);
  };

  const handleButtonClick = async (button: SmartHubButton) => {
    const action = resolveClickAction(button.click_action, button.type);
    if (action === 'form') {
      openForm(button);
      return;
    }
    if (action === 'booking') {
      openBooking(button);
      return;
    }
    if (action === 'info') return;

    const capture = mergeCaptureConfig(hub?.capture_config);
    const destination =
      buildDestinationUrl(
        action === 'whatsapp' ? 'whatsapp' : action === 'email' ? 'email' : button.type,
        button.url ||
          (action === 'whatsapp'
            ? button.capture_config?.whatsapp_phone ||
              capture.whatsapp_phone ||
              hub?.whatsapp_number
            : null),
        button.whatsapp_message ||
          button.capture_config?.whatsapp_message ||
          capture.whatsapp_message,
        button.capture_config?.email_subject
      ) || button.url;

    if (hub?.id && button.track_click !== false) {
      try {
        await AnalyticsService.trackClick(hub.id, button.id?.startsWith('hub-') ? null : button.id, {
          target_url: destination,
          device_type:
            window.innerWidth < 768 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop',
          button_title: button.title,
          button_type: button.type,
          click_action: action,
          visual_variant: button.visual_variant || 'simple',
          order_index: button.order_index ?? null,
          template_id: hub.template_id,
          style_preset: hub.style_preset,
        });
      } catch {
        /* ignore */
      }
    }

    if (destination) {
      const openInNew =
        button.capture_config?.open_in_new_tab !== undefined
          ? Boolean(button.capture_config.open_in_new_tab)
          : !(action === 'phone' || action === 'email' || button.type === 'internal');
      window.open(destination, openInNew ? '_blank' : '_self', 'noopener,noreferrer');
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !data || !hub) {
    return <NotFound />;
  }

  return (
    <>
      <HubPublicView
        payload={data}
        onButtonClick={handleButtonClick}
        onOpenCaptureForm={openForm}
      />
      <HubCaptureForm
        hub={hub}
        button={formButton}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
      <HubBookingWizard
        hub={hub}
        button={bookingButton}
        open={bookingOpen}
        onOpenChange={setBookingOpen}
      />
    </>
  );
}
