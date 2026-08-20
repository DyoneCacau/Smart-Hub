import { memo, useMemo, type CSSProperties } from 'react';
import { HubBanner } from './HubBanner';
import { HubHeader } from './HubHeader';
import { HubGrid } from './HubGrid';
import { HubFooter } from './HubFooter';
import { HubSocialLinks } from './HubSocialLinks';
import { HubWhatsAppButton } from './HubWhatsAppButton';
import { HubContact } from './HubContact';
import { HubMap } from './HubMap';
import { HubLogo } from './HubLogo';
import { MessageCircle } from 'lucide-react';
import type {
  PublicSmartHubPayload,
  SmartHubButton,
  SmartHubVisualConfig,
} from '@/types/smartHub';
import { mergeVisualConfig } from '@/services/smartHub/imageUtils';
import { buildDestinationUrl } from '@/services/smartHub/buttonDestinations';
import { resolveClickAction } from '@/services/smartHub/captureDefaults';
import { ensureBannerBlock } from '@/lib/smartHubLayout';
import { cn } from '@/lib/utils';

interface HubPublicViewProps {
  payload: PublicSmartHubPayload;
  preview?: boolean;
  onButtonClick?: (button: SmartHubButton) => void;
  onOpenCaptureForm?: (button?: SmartHubButton | null) => void;
  className?: string;
}

function radiusClass(value?: string): string {
  switch (value) {
    case 'none':
      return 'rounded-none';
    case 'md':
      return 'rounded-md';
    case 'full':
      return 'rounded-full';
    case 'xl':
      return 'rounded-xl';
    default:
      return 'rounded-lg';
  }
}

function maxWidthClass(value?: string): string {
  switch (value) {
    case 'sm':
      return 'max-w-md';
    case 'lg':
      return 'max-w-3xl';
    default:
      return 'max-w-2xl';
  }
}

export const HubPublicView = memo(function HubPublicView({
  payload,
  preview = false,
  onButtonClick,
  onOpenCaptureForm,
  className,
}: HubPublicViewProps) {
  const hub = payload.hub;
  const buttons = payload.buttons ?? [];
  const theme = payload.theme;
  const visual: SmartHubVisualConfig = mergeVisualConfig(hub.style_preset, hub.visual_config);

  const primary = theme?.primary_color || hub.primary_color || visual.button_bg_color || '#0F766E';
  const textColor = visual.text_color || theme?.text_color || undefined;
  const blocks = ensureBannerBlock(hub.layout_blocks);
  const hasWhatsappBlock = blocks.includes('whatsapp');
  const hasSocialBlock = blocks.includes('social');
  const hasLogoBlock = blocks.includes('logo');
  const hasHeader = blocks.includes('header');
  const hasDescription = blocks.includes('description');
  const hasBanner = true;
  const align =
    visual.content_align === 'left'
      ? 'items-start text-left'
      : visual.content_align === 'right'
        ? 'items-end text-right'
        : 'items-center text-center';

  const socialTypes = new Set(['social', 'instagram', 'facebook', 'tiktok', 'youtube']);

  const socialLinks = useMemo(
    () =>
      buttons
        .filter((b) => socialTypes.has(b.type) && b.url)
        .map((b) => ({
          label: b.title,
          url: buildDestinationUrl(b.type, b.url) || b.url!,
        })),
    [buttons]
  );

  const whatsappFromButtons = buttons.filter((b) => b.type === 'whatsapp' && b.url);
  const whatsappFallback: SmartHubButton | undefined = hub.whatsapp_number
    ? ({
        id: 'hub-whatsapp',
        title: 'Falar no WhatsApp',
        url: hub.whatsapp_number,
        type: 'whatsapp',
        track_click: true,
        visual_variant: 'simple',
      } as SmartHubButton)
    : undefined;
  const whatsappPrimary = whatsappFromButtons[0] || whatsappFallback;
  const whatsappHref = whatsappPrimary
    ? buildDestinationUrl(
        'whatsapp',
        whatsappPrimary.url,
        whatsappPrimary.whatsapp_message
      )
    : null;

  const gridButtons = buttons.filter((b) => {
    if (b.type === 'whatsapp' && hasWhatsappBlock) return false;
    if (socialTypes.has(b.type) && hasSocialBlock) return false;
    return true;
  });

  const renderedButtonCount =
    gridButtons.length +
    (hasWhatsappBlock && whatsappPrimary ? 1 : 0) +
    (hasSocialBlock ? socialLinks.length : 0);

  const profileSrc = hub.profile_url || hub.logo_url;
  const showFloatingWhatsapp =
    Boolean(visual.floating_whatsapp || hub.style_preset === 'whatsapp') &&
    Boolean(whatsappHref);

  const bgStyle: CSSProperties = (() => {
    if (visual.background_mode === 'gradient') {
      return {
        backgroundImage: `linear-gradient(160deg, ${visual.gradient_from || '#F8FAFC'}, ${visual.gradient_to || '#E2E8F0'})`,
      };
    }
    if (visual.background_mode === 'image' && (hub.background_url || visual)) {
      const url = hub.background_url;
      if (url) {
        return {
          backgroundImage: `url(${url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        };
      }
    }
    return {
      backgroundColor: visual.background_color || theme?.background_color || undefined,
    };
  })();

  const handleClick = (button: SmartHubButton) => {
    const action = resolveClickAction(button.click_action, button.type);
    if (action === 'form') {
      onOpenCaptureForm?.(button);
      return;
    }
    if (action === 'booking') {
      onButtonClick?.(button);
      return;
    }
    if (action === 'info') return;

    if (onButtonClick) {
      onButtonClick(button);
      return;
    }
    const href = buildDestinationUrl(button.type, button.url, button.whatsapp_message);
    if (href) {
      const self = button.type === 'internal' || button.type === 'phone' || button.type === 'email';
      window.open(href, self ? '_self' : '_blank');
    }
  };

  const rClass = radiusClass(visual.border_radius);

  const rendered = blocks.map((block, index) => {
    switch (block) {
      case 'banner':
        return (
          <div key={`${block}-${index}`} className="relative">
            <HubBanner
              src={hub.banner_url}
              alt={`Banner de ${hub.title || 'clínica'}`}
              primaryColor={primary}
              secondaryColor={visual.gradient_to || theme?.secondary_color || '#134E4A'}
              showUploadHint={preview}
            />
            {hub.banner_url && visual.banner_overlay_color ? (
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundColor: visual.banner_overlay_color,
                  opacity: visual.banner_overlay_opacity ?? 0.2,
                }}
              />
            ) : null}
          </div>
        );
      case 'logo':
        return profileSrc ? (
          <div
            key={`${block}-${index}`}
            className={cn(
              'flex px-4',
              align.includes('start')
                ? 'justify-start'
                : align.includes('end')
                  ? 'justify-end'
                  : 'justify-center',
              hasBanner && '-mt-10 relative z-10'
            )}
          >
            <HubLogo
              src={profileSrc}
              alt={hub.title || 'Foto da clínica'}
              className="h-24 w-24 border-4 border-background shadow-md"
            />
          </div>
        ) : null;
      case 'header':
        return (
          <HubHeader
            key={`${block}-${index}`}
            title={hub.title}
            subtitle={hub.subtitle}
            description={hasDescription ? null : hub.description}
            logoUrl={hasLogoBlock ? null : hub.logo_url}
            showLogo={!hasLogoBlock}
            primaryColor={primary}
            className={align}
          />
        );
      case 'description':
        if (hasHeader) return null;
        return (
          <HubHeader
            key={`${block}-${index}`}
            description={hub.description}
            showLogo={false}
            primaryColor={primary}
            className={align}
          />
        );
      case 'whatsapp':
        return whatsappPrimary || whatsappHref ? (
          <HubWhatsAppButton
            key={`${block}-${index}`}
            phone={whatsappPrimary?.url || hub.whatsapp_number || whatsappHref}
            message={whatsappPrimary?.whatsapp_message || undefined}
            label={whatsappPrimary?.title || 'Falar no WhatsApp'}
            onClick={(e) => {
              e.preventDefault();
              if (whatsappPrimary) handleClick(whatsappPrimary);
            }}
          />
        ) : null;
      case 'buttons':
      case 'grid':
        return (
          <HubGrid
            key={`${block}-${index}`}
            buttons={gridButtons}
            onButtonClick={handleClick}
            showEmpty={renderedButtonCount === 0}
            emptyLabel="Adicione links ou um WhatsApp para começar a receber contatos."
            columns={block === 'grid' ? 2 : 1}
            defaultBg={visual.button_bg_color || primary}
            defaultFg={visual.button_text_color || '#FFFFFF'}
            radiusClass={rClass}
          />
        );
      case 'social':
        return socialLinks.length ? (
          <HubSocialLinks key={`${block}-${index}`} links={socialLinks} />
        ) : null;
      case 'contact':
        return (
          <HubContact
            key={`${block}-${index}`}
            phone={hub.contact_phone}
            email={hub.contact_email}
          />
        );
      case 'map':
        return (
          <HubMap
            key={`${block}-${index}`}
            address={hub.contact_address}
            embedUrl={hub.map_embed_url}
          />
        );
      case 'footer':
        return <HubFooter key={`${block}-${index}`} />;
      default:
        return null;
    }
  });

  return (
    <div
      className={cn(
        'relative',
        preview ? 'min-h-full' : 'min-h-screen',
        'motion-safe:scroll-smooth overflow-x-hidden',
        className
      )}
      style={{
        ...bgStyle,
        color: textColor,
        fontFamily: theme?.font_family || hub.font_family,
      }}
    >
      <div
        className={cn(
          'bg-background/40 backdrop-blur-[1px] supports-[padding:max(0px)]:pb-[max(1rem,env(safe-area-inset-bottom))]',
          preview ? 'min-h-full' : 'min-h-screen'
        )}
      >
        {preview && (
          <div className="sticky top-0 z-20 border-b bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">
            Prévia — as alterações só vão para a página pública após salvar
            {hub.status === 'published' ? ' (hub já publicado: salvar atualiza a página).' : '.'}
          </div>
        )}
        <div
          className={cn(
            'mx-auto flex w-full flex-col gap-6 py-8',
            maxWidthClass(visual.max_width),
            visual.spacing === 'compact' && 'gap-4',
            visual.spacing === 'relaxed' && 'gap-8'
          )}
        >
          {rendered}
        </div>
      </div>

      {showFloatingWhatsapp && whatsappHref && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Abrir WhatsApp"
          onClick={(e) => {
            if (whatsappPrimary && onButtonClick) {
              e.preventDefault();
              onButtonClick(whatsappPrimary);
            }
          }}
          className={cn(
            'z-30 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
            preview
              ? 'absolute bottom-4 right-4'
              : 'fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4'
          )}
        >
          <MessageCircle className="h-6 w-6" />
        </a>
      )}
    </div>
  );
});
