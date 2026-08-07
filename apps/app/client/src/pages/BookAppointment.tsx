import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Clock, Video } from "lucide-react";
import { Link } from "wouter";

declare global {
  interface Window {
    calendar?: {
      schedulingButton: {
        load: (config: {
          url: string;
          color: string;
          label: string;
          target: HTMLElement;
        }) => void;
      };
    };
  }
}

export default function BookAppointment() {
  const { t } = useTranslation();
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://calendar.google.com/calendar/scheduling-button-script.js";
    script.async = true;
    document.head.appendChild(script);

    const link = document.createElement("link");
    link.href = "https://calendar.google.com/calendar/scheduling-button-script.css";
    link.rel = "stylesheet";
    document.head.appendChild(link);

    script.onload = () => {
      if (window.calendar && calendarRef.current) {
        window.calendar.schedulingButton.load({
          url: "https://calendar.google.com/calendar/appointments/AcZssZ2uATL6QnpltlYbFvW-qePmqk7pXhhqV2WZkcI=?gv=true",
          color: "#039BE5",
          label: "Book an appointment",
          target: calendarRef.current,
        });
      }
    };

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href="/">
          <Button variant="ghost" className="mb-6" data-testid="button-back-home">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Book an Appointment</h1>
          <p className="text-muted-foreground text-lg">
            Schedule a consultation with our automotive experts
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" />
                Live Consultations
              </CardTitle>
              <CardDescription>
                Get real-time expert advice on your automotive repairs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  30-60 minute sessions available
                </li>
                <li className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Flexible scheduling options
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                How It Works
              </CardTitle>
              <CardDescription>
                Easy 3-step booking process
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                <li>Click the booking button below</li>
                <li>Select your preferred date and time</li>
                <li>Receive confirmation via email</li>
              </ol>
            </CardContent>
          </Card>
        </div>

        <Card className="text-center">
          <CardHeader>
            <CardTitle>Ready to Schedule?</CardTitle>
            <CardDescription>
              Click the button below to view available time slots
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div 
              ref={calendarRef} 
              className="flex justify-center py-4"
              data-testid="calendar-booking-widget"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
