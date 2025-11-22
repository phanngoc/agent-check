import { Component } from "solid-js";
import { Router, Route } from "@solidjs/router";
import { Home } from "./pages/Home";
import { ServiceDetail } from "./pages/ServiceDetail";

export const App: Component = () => {
  return (
    <Router>
      <Route path="/" component={Home} />
      <Route path="/services/:id" component={ServiceDetail} />
    </Router>
  );
};

