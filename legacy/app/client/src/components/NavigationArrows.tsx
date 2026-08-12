import { ChevronLeft, ChevronRight, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLocation } from "wouter";

export default function NavigationArrows() {
  const [, setLocation] = useLocation();

  const handleBack = () => {
    window.history.back();
  };

  const handleForward = () => {
    window.history.forward();
  };

  const handleHome = () => {
    setLocation("/dashboard");
  };

  const handleReset = () => {
    window.location.reload();
  };

  return (
    <div 
      className="fixed bottom-4 left-4 z-50 flex items-center gap-1 bg-background/95 backdrop-blur-md border-2 border-primary/20 rounded-full p-1.5 shadow-xl"
      data-testid="navigation-arrows"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="rounded-full"
            data-testid="button-nav-back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Go back</p>
        </TooltipContent>
      </Tooltip>
      
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleHome}
            className="rounded-full"
            data-testid="button-nav-home"
          >
            <Home className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Dashboard</p>
        </TooltipContent>
      </Tooltip>
      
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleReset}
            className="rounded-full"
            data-testid="button-nav-reset"
          >
            <RotateCcw className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Refresh page</p>
        </TooltipContent>
      </Tooltip>
      
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleForward}
            className="rounded-full"
            data-testid="button-nav-forward"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Go forward</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
