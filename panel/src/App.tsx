import { Component } from "solid-js";
import { Router, Route } from "@solidjs/router";
import { Home } from "./pages/Home";
import { ServiceDetail } from "./pages/ServiceDetail";
import { Projects } from "./pages/Projects";
import { ProjectEditor } from "./pages/ProjectEditor";

export const App: Component = () => {
  return (
    <Router>
      <Route path="/" component={Home} />
      <Route path="/services/:id" component={ServiceDetail} />
      <Route path="/projects" component={Projects} />
      <Route path="/projects/:id/editor" component={ProjectEditor} />
    </Router>
  );
};

