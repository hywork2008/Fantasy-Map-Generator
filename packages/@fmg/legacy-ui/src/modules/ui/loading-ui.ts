// @ts-nocheck
type D3SelectionLike = {
  transition: () => D3TransitionLike;
};

type D3TransitionLike = {
  duration: (ms: number) => D3TransitionLike;
  style: (name: string, value: string | number) => D3TransitionLike;
};

type LoadingUiDeps = {
  d3: {
    select: (selector: string) => D3SelectionLike;
  };
};

export function hideLoadingUI({ d3 }: LoadingUiDeps) {
  d3.select("#loading").transition().duration(3000).style("opacity", 0);
  d3.select("#optionsContainer").transition().duration(2000).style("opacity", 1);
  d3.select("#tooltip").transition().duration(3000).style("opacity", 1);
}

export function showLoadingUI({ d3 }: LoadingUiDeps) {
  d3.select("#loading").transition().duration(200).style("opacity", 1);
  d3.select("#optionsContainer").transition().duration(100).style("opacity", 0);
  d3.select("#tooltip").transition().duration(200).style("opacity", 0);
}