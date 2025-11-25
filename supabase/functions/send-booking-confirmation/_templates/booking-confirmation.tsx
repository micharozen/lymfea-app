import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
  Hr,
  Section,
} from 'https://esm.sh/@react-email/components@0.0.22'
import * as React from 'https://esm.sh/react@18.3.1'

interface BookingConfirmationEmailProps {
  bookingNumber: string
  clientName: string
  hotelName: string
  roomNumber: string
  bookingDate: string
  bookingTime: string
  treatments: string[]
  totalPrice: number
  currency: string
}

export const BookingConfirmationEmail = ({
  bookingNumber,
  clientName,
  hotelName,
  roomNumber,
  bookingDate,
  bookingTime,
  treatments,
  totalPrice,
  currency,
}: BookingConfirmationEmailProps) => (
  <Html>
    <Head />
    <Preview>Booking Confirmation #{bookingNumber} - OOM World</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header with Logo */}
        <Section style={header}>
          <Text style={logoText}>OOM</Text>
          <Text style={logoSubtext}>WORLD</Text>
        </Section>

        {/* Main Content */}
        <Section style={content}>
          <Heading style={h1}>Booking Confirmed</Heading>
          
          <Text style={greeting}>
            Dear {clientName},
          </Text>
          
          <Text style={text}>
            Your booking has been successfully confirmed. A hairdresser will be assigned to your appointment shortly and you will receive a notification.
          </Text>

          {/* Booking Details Card */}
          <Section style={bookingCard}>
            <Section style={bookingHeader}>
              <Text style={bookingNumberStyle}>Booking #{bookingNumber}</Text>
            </Section>

            <Hr style={divider} />

            <Section style={detailsSection}>
              <Text style={label}>Location</Text>
              <Text style={value}>{hotelName}</Text>
              {roomNumber && <Text style={subValue}>Room {roomNumber}</Text>}
            </Section>

            <Hr style={divider} />

            <Section style={detailsSection}>
              <Text style={label}>Date & Time</Text>
              <Text style={value}>{bookingDate}</Text>
              <Text style={subValue}>{bookingTime}</Text>
            </Section>

            <Hr style={divider} />

            <Section style={detailsSection}>
              <Text style={label}>Services</Text>
              {treatments.map((treatment, index) => (
                <Text key={index} style={treatmentItem}>• {treatment}</Text>
              ))}
            </Section>

            <Hr style={divider} />

            <Section style={totalSection}>
              <Text style={label}>Total</Text>
              <Text style={totalPriceStyle}>{totalPrice} {currency}</Text>
            </Section>
          </Section>

          <Text style={thankYou}>
            We look forward to providing you with an exceptional experience.
          </Text>
        </Section>

        {/* Footer */}
        <Section style={footer}>
          <Hr style={footerDivider} />
          <Text style={footerText}>
            OOM World - Premium Hairdressing Services
          </Text>
          <Text style={footerSubtext}>
            Questions? Contact us at booking@oomworld.com
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default BookingConfirmationEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
  padding: '0',
  margin: '0',
}

const container = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
}

const header = {
  backgroundColor: '#1a1a1a',
  padding: '40px 0',
  textAlign: 'center' as const,
}

const logoText = {
  color: '#ffffff',
  fontSize: '48px',
  fontWeight: 'bold',
  letterSpacing: '4px',
  margin: '0',
  padding: '0',
  lineHeight: '1',
}

const logoSubtext = {
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: '400',
  letterSpacing: '8px',
  margin: '8px 0 0 0',
  padding: '0',
}

const content = {
  padding: '48px 40px',
}

const h1 = {
  color: '#1a1a1a',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0 0 24px 0',
  padding: '0',
  letterSpacing: '-0.5px',
}

const greeting = {
  color: '#1a1a1a',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px 0',
}

const text = {
  color: '#525252',
  fontSize: '15px',
  lineHeight: '24px',
  margin: '0 0 32px 0',
}

const bookingCard = {
  backgroundColor: '#fafafa',
  border: '1px solid #e5e5e5',
  borderRadius: '8px',
  overflow: 'hidden',
  margin: '32px 0',
}

const bookingHeader = {
  backgroundColor: '#1a1a1a',
  padding: '16px 24px',
}

const bookingNumberStyle = {
  color: '#ffffff',
  fontSize: '18px',
  fontWeight: '600',
  margin: '0',
  letterSpacing: '0.5px',
}

const detailsSection = {
  padding: '20px 24px',
}

const label = {
  color: '#737373',
  fontSize: '12px',
  fontWeight: '600',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  margin: '0 0 8px 0',
}

const value = {
  color: '#1a1a1a',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0 0 4px 0',
}

const subValue = {
  color: '#525252',
  fontSize: '14px',
  margin: '0',
}

const treatmentItem = {
  color: '#1a1a1a',
  fontSize: '15px',
  lineHeight: '26px',
  margin: '0',
}

const totalSection = {
  padding: '20px 24px',
  backgroundColor: '#f5f5f5',
}

const totalPriceStyle = {
  color: '#1a1a1a',
  fontSize: '28px',
  fontWeight: '700',
  margin: '0',
  letterSpacing: '-0.5px',
}

const divider = {
  borderColor: '#e5e5e5',
  borderTop: '1px solid #e5e5e5',
  margin: '0',
}

const thankYou = {
  color: '#525252',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '32px 0 0 0',
  textAlign: 'center' as const,
}

const footer = {
  padding: '32px 40px',
  backgroundColor: '#fafafa',
}

const footerDivider = {
  borderColor: '#e5e5e5',
  borderTop: '1px solid #e5e5e5',
  margin: '0 0 24px 0',
}

const footerText = {
  color: '#1a1a1a',
  fontSize: '14px',
  fontWeight: '600',
  textAlign: 'center' as const,
  margin: '0 0 8px 0',
}

const footerSubtext = {
  color: '#737373',
  fontSize: '12px',
  textAlign: 'center' as const,
  margin: '0',
}
