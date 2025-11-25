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
    <Preview>Your booking #{bookingNumber} is confirmed - {hotelName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your booking is confirmed!</Heading>
        
        <Text style={text}>
          Dear {clientName},
        </Text>
        
        <Text style={text}>
          Thank you for your booking. A hairdresser will be assigned to your booking shortly.
        </Text>

        <Section style={bookingBox}>
          <Text style={label}>Booking Number</Text>
          <Text style={value}>#{bookingNumber}</Text>
          
          <Hr style={hr} />
          
          <Text style={label}>Location</Text>
          <Text style={value}>{hotelName}</Text>
          <Text style={subValue}>Room {roomNumber}</Text>
          
          <Hr style={hr} />
          
          <Text style={label}>Date</Text>
          <Text style={value}>{bookingDate}</Text>
          
          <Hr style={hr} />
          
          <Text style={label}>Time</Text>
          <Text style={value}>{bookingTime}</Text>
          
          <Hr style={hr} />
          
          <Text style={label}>Services</Text>
          {treatments.map((treatment, index) => (
            <Text key={index} style={treatmentItem}>• {treatment}</Text>
          ))}
          
          <Hr style={hr} />
          
          <Text style={label}>Total Price</Text>
          <Text style={totalValue}>{totalPrice} {currency}</Text>
        </Section>

        <Text style={footer}>
          We look forward to serving you!
        </Text>
      </Container>
    </Body>
  </Html>
)

export default BookingConfirmationEmail

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
}

const h1 = {
  color: '#1a1a1a',
  fontSize: '32px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0 48px',
  textAlign: 'center' as const,
}

const text = {
  color: '#525252',
  fontSize: '16px',
  lineHeight: '24px',
  textAlign: 'left' as const,
  padding: '0 48px',
}

const bookingBox = {
  backgroundColor: '#f8f8f8',
  borderRadius: '8px',
  margin: '32px 48px',
  padding: '24px',
}

const label = {
  color: '#737373',
  fontSize: '14px',
  fontWeight: '500',
  marginBottom: '8px',
  marginTop: '0',
}

const value = {
  color: '#1a1a1a',
  fontSize: '18px',
  fontWeight: '600',
  marginTop: '0',
  marginBottom: '4px',
}

const subValue = {
  color: '#525252',
  fontSize: '16px',
  marginTop: '0',
  marginBottom: '0',
}

const totalValue = {
  color: '#1a1a1a',
  fontSize: '24px',
  fontWeight: 'bold',
  marginTop: '0',
  marginBottom: '0',
}

const treatmentItem = {
  color: '#1a1a1a',
  fontSize: '16px',
  marginTop: '4px',
  marginBottom: '4px',
}

const hr = {
  borderColor: '#e5e5e5',
  margin: '20px 0',
}

const footer = {
  color: '#737373',
  fontSize: '14px',
  lineHeight: '24px',
  textAlign: 'center' as const,
  padding: '0 48px',
  marginTop: '32px',
}
